import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, getDocs, addDoc, doc, updateDoc,
  getDoc, setDoc, query, where, deleteDoc
} from "firebase/firestore";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signInAnonymously, onAuthStateChanged, signOut
} from "firebase/auth";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import './App.css';

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyBSKT0kmhfyLHSur-Z8nnj3jrYn2KBcP0M",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const storage = getStorage(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// --- Helpers ---
const parseUnitStr = (unitStr) => {
  if (!unitStr) return { baseQty: 1, text: 'টি', step: 1 };
  const engStr = String(unitStr).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  const match = engStr.match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    const num = parseFloat(match[1]);
    const txt = match[2] ? match[2].trim() : 'টি';
    let stepAmount = 1;
    if (txt.includes('গ্রাম') || txt.includes('gm') || txt.includes('মিলি') || txt.includes('ml')) {
      stepAmount = num >= 100 ? 50 : 10;
    }
    return { baseQty: num, text: txt, step: stepAmount };
  }
  return { baseQty: 1, text: unitStr, step: 1 };
};

const toBanglaNum = (num) => {
  if (!num && num !== 0) return '০';
  return Number(num).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
};

const deliveryLocations = [
  "গোবিন্দল", "সিংগাইর বাজার", "নীলটেক", "পুকুরপাড়া",
  "ঘোনাপাড়া", "বকচর", "সিংগাইর উপজেলার ভেতরে", "নিজে লেখুন"
];

const getDeliveryCharge = (locationName) => {
  const twentyAreas = ["গোবিন্দল", "সিংগাইর বাজার", "নীলটেক", "পুকুরপাড়া", "ঘোনাপাড়া", "বকচর"];
  if (twentyAreas.includes(locationName)) return 20;
  if (locationName === "সিংগাইর উপজেলার ভেতরে") return 40;
  return 50;
};

const getStatusClass = (status) => {
  const map = {
    'Pending': 'st-pending', 'Confirmed': 'st-confirmed',
    'On Delivery': 'st-delivery', 'Delivered': 'st-delivered', 'Cancelled': 'st-cancelled'
  };
  return map[status] || 'st-pending';
};

// =========================================================================
// MAIN APP COMPONENT
// =========================================================================
export default function App() {
  const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];

  // States
  const [products, setProducts] = useState([]);
  const [headerImage, setHeaderImage] = useState('https://placehold.co/820x312/27ae60/ffffff?text=Sakib+Store');
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম! 🌿 সেরা মানের পণ্য, সাশ্রয়ী মূল্যে।');
  const [notification, setNotification] = useState({ text: '', expiresAt: 0, show: false });
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  const [activeTab, setActiveTab] = useState('home');
  const [tabHistory, setTabHistory] = useState(['home']);
  const [viewMode, setViewMode] = useState('customer');
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [adminTab, setAdminTab] = useState('orders');
  const [adminOrderFilter, setAdminOrderFilter] = useState('All');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [customLocation, setCustomLocation] = useState('');
  const [userInfo, setUserInfo] = useState({
    name: '', phone: '', locationType: 'গোবিন্দল', district: 'মানিকগঞ্জ',
    area: 'সিংগাইর', address: '', paymentMethod: 'Cash on Delivery',
    senderNumber: '', transactionId: '',
    profilePic: '', coverPic: ''
  });

  const [adminPass, setAdminPass] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  const [editId, setEditId] = useState(null);
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১ কেজি' });
  const [newNotif, setNewNotif] = useState({ text: '', durationMins: 60 });

  const backPressTime = useRef(0);

  // ---- Initial Load ----
  useEffect(() => {
    fetchProducts();
    fetchSettings();

    // FIX: Handle Google redirect result on mount (for mobile redirect flow)
    getRedirectResult(auth).then((result) => {
      if (result && result.user) {
        const u = result.user;
        setUser({ id: u.uid, isAnonymous: u.isAnonymous, email: u.email });
        loadUserData(u.uid);
      }
    }).catch((err) => {
      console.error("Redirect result error:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setIsLoading(false);
      if (currentUser) {
        setUser({ id: currentUser.uid, isAnonymous: currentUser.isAnonymous, email: currentUser.email });
        loadUserData(currentUser.uid);
      } else {
        setUser(null);
        const localData = localStorage.getItem('tempUserInfo');
        if (localData) {
          try { setUserInfo(JSON.parse(localData)); } catch (e) { /* skip */ }
        }
      }
    });

    // Back button handling
    window.history.pushState(null, null, window.location.pathname);
    const handlePopState = () => {
      window.history.pushState(null, null, window.location.pathname);
      if (isDrawerOpen) { setIsDrawerOpen(false); return; }
      setTabHistory(prevHistory => {
        if (prevHistory.length > 1) {
          const newHistory = [...prevHistory];
          newHistory.pop();
          setActiveTab(newHistory[newHistory.length - 1]);
          return newHistory;
        } else {
          const currentTime = new Date().getTime();
          if (currentTime - backPressTime.current < 2000) {
            window.close();
          } else {
            backPressTime.current = currentTime;
            showToast('অ্যাপ থেকে বের হতে আবার Back চাপুন', 'warning');
          }
          return prevHistory;
        }
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => { unsubscribe(); window.removeEventListener('popstate', handlePopState); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toast notification
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const changeTab = (tabName) => {
    setActiveTab(tabName);
    setTabHistory(prev => [...prev, tabName]);
    window.scrollTo(0, 0);
  };

  // ---- Firebase Data ----
  const fetchProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchProducts error:", e); }
  };

  const fetchSettings = async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "general"));
      if (snap.exists()) {
        const data = snap.data();
        if (data.header) setHeaderImage(data.header);
        if (data.notice) setScrollingNotice(data.notice);
        if (data.notification) {
          setNotification({ ...data.notification, show: Date.now() <= data.notification.expiresAt });
        }
      }
    } catch (e) { console.error("fetchSettings error:", e); }
  };

  const loadUserData = async (uid) => {
    try {
      const uSnap = await getDoc(doc(db, "users", uid));
      if (uSnap.exists() && uSnap.data().info) {
        setUserInfo(prev => ({ ...prev, ...uSnap.data().info }));
      }
      const oSnap = await getDocs(query(collection(db, "orders"), where("userId", "==", uid)));
      setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) { console.error("loadUserData error:", e); }
  };

  // ---- Auth ----
  // FIX: billing-not-enabled → try popup, on error use redirect (mobile-safe)
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        showToast('গুগল লগইন সফল! ✅');
        changeTab('home');
      }
    } catch (e) {
      if (e.code === 'auth/billing-not-enabled' || e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        // FIX: fallback to redirect for mobile / billing issues
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (err) {
          showToast('লগইন সমস্যা: ' + err.message, 'error');
        }
      } else {
        showToast('লগইন বাতিল: ' + e.message, 'error');
      }
    }
  };

  const handleGuestLogin = async () => {
    try {
      await signInAnonymously(auth);
      showToast('গেস্ট হিসেবে প্রবেশ করেছেন!');
      changeTab('home');
    } catch (e) { showToast('সমস্যা: ' + e.message, 'error'); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserInfo({ name: '', phone: '', locationType: 'গোবিন্দল', district: 'মানিকগঞ্জ', area: 'সিংগাইর', address: '', paymentMethod: 'Cash on Delivery', senderNumber: '', transactionId: '', profilePic: '', coverPic: '' });
    setCart([]);
    changeTab('home');
  };

  // ---- Image Upload ----
  const handleImageUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    showToast('ছবি আপলোড হচ্ছে...');
    const storageRef = ref(storage, `users/${user.id}/${type}_${Date.now()}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on('state_changed', null,
      (error) => showToast(error.message, 'error'),
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        const updated = { ...userInfo, [type]: url };
        setUserInfo(updated);
        await saveProfileData(updated);
        showToast('ছবি আপডেট হয়েছে! ✅');
      }
    );
  };

  const saveProfileData = async (dataToSave = userInfo) => {
    if (user) {
      await setDoc(doc(db, "users", user.id), { info: dataToSave }, { merge: true });
      showToast('প্রোফাইল আপডেট হয়েছে! ✅');
    } else {
      localStorage.setItem('tempUserInfo', JSON.stringify(dataToSave));
      showToast('তথ্য সাময়িকভাবে সেভ হয়েছে।');
    }
  };

  // ---- Cart Logic ----
  const handleCart = (product, action) => {
    const { baseQty, step } = parseUnitStr(product.unit);
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (action === 'add') {
        if (product.stock <= 0) { showToast('পণ্যটি স্টকে নেই!', 'error'); return prev; }
        if (existing) {
          if ((existing.qty + step) > (product.stock * baseQty)) return prev;
          return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + step } : i);
        }
        return [...prev, { ...product, qty: baseQty }];
      }
      if (action === 'remove' && existing) {
        if (existing.qty > baseQty) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty - step } : i);
        return prev.filter(i => i.id !== product.id);
      }
      return prev;
    });
  };

  const totalCartPrice = cart.reduce((acc, item) => acc + (item.price / parseUnitStr(item.unit).baseQty) * item.qty, 0);
  const deliveryCharge = cart.length > 0 ? getDeliveryCharge(userInfo.locationType) : 0;
  const finalTotal = totalCartPrice + deliveryCharge;

  const submitOrder = async () => {
    if (!userInfo.name || !userInfo.phone || !userInfo.district || !userInfo.area || !userInfo.address) {
      return showToast('ডেলিভারির সকল তথ্য দিন!', 'error');
    }
    const finalLoc = userInfo.locationType === 'নিজে লেখুন' ? customLocation : userInfo.locationType;
    if (userInfo.locationType === 'নিজে লেখুন' && !customLocation) return showToast('জায়গার নাম লিখুন!', 'error');
    if ((userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nogod') && (!userInfo.senderNumber || !userInfo.transactionId)) {
      return showToast('সেন্ডার নম্বর ও TrxID দিন!', 'error');
    }
    const orderData = {
      items: cart,
      userInfo: { ...userInfo, finalLocation: finalLoc },
      userId: user?.id || 'Guest_' + Date.now(),
      paymentMethod: userInfo.paymentMethod,
      total: finalTotal,
      status: 'Pending',
      date: new Date().toLocaleString('bn-BD'),
      timestamp: Date.now()
    };
    try {
      await addDoc(collection(db, "orders"), orderData);
      for (const item of cart) {
        const { baseQty } = parseUnitStr(item.unit);
        const newStock = Math.max(0, item.stock - item.qty / baseQty);
        await updateDoc(doc(db, "products", item.id), { stock: newStock });
      }
      if (user) await setDoc(doc(db, "users", user.id), { info: userInfo }, { merge: true });
      showToast('অর্ডার সফল হয়েছে! 🎉');
      setCart([]);
      fetchProducts();
      changeTab('profile');
      if (user) loadUserData(user.id);
    } catch (e) { showToast('সমস্যা হয়েছে: ' + e.message, 'error'); }
  };

  // ---- Admin Logic ----
  const fetchAllOrders = async () => {
    setIsAdminLoading(true);
    try {
      const snap = await getDocs(collection(db, "orders"));
      setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) { showToast('ডেটা লোড সমস্যা!', 'error'); }
    setIsAdminLoading(false);
  };

  const saveProduct = async () => {
    if (!newP.name || !newP.price) return showToast('নাম ও দাম দিন!', 'error');
    try {
      if (editId) {
        await updateDoc(doc(db, "products", editId), newP);
        showToast('পণ্য আপডেট হয়েছে! ✅');
      } else {
        await addDoc(collection(db, "products"), newP);
        showToast('নতুন পণ্য যোগ হয়েছে! ✅');
      }
      setEditId(null);
      setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১ কেজি' });
      fetchProducts();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const pushNotification = async () => {
    if (!newNotif.text) return;
    const expiresAt = Date.now() + newNotif.durationMins * 60000;
    const notifData = { text: newNotif.text, expiresAt };
    await setDoc(doc(db, "settings", "general"), { notification: notifData }, { merge: true });
    setNotification({ ...notifData, show: true });
    showToast('নোটিফিকেশন পাঠানো হয়েছে! ✅');
  };

  const saveGeneralSettings = async () => {
    await setDoc(doc(db, "settings", "general"), { header: headerImage, notice: scrollingNotice }, { merge: true });
    showToast('সেটিংস সেভ হয়েছে! ✅');
  };

  // =========================================================================
  // ADMIN LOGIN VIEW
  // =========================================================================
  if (viewMode === 'adminLogin') {
    return (
      <div className="fullscreen-center">
        <div className="admin-login-box">
          <div className="admin-logo">🛡️</div>
          <h2>অ্যাডমিন লগইন</h2>
          <input type="password" className="admin-input" placeholder="পাসওয়ার্ড দিন..."
            value={adminPass} onChange={e => setAdminPass(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && adminPass === 'sakib123') { setViewMode('admin'); fetchAllOrders(); setAdminPass(''); } }}
          />
          <button className="btn-primary" onClick={() => {
            if (adminPass === 'sakib123') { setViewMode('admin'); fetchAllOrders(); setAdminPass(''); }
            else showToast('ভুল পাসওয়ার্ড!', 'error');
          }}>লগইন</button>
          <button className="btn-outline mt-10" onClick={() => { setViewMode('customer'); changeTab('home'); }}>
            ← ফিরে যান
          </button>
        </div>
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </div>
    );
  }

  // =========================================================================
  // ADMIN PANEL VIEW
  // =========================================================================
  if (viewMode === 'admin') {
    return (
      <div className="admin-wrapper">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <header className="admin-header">
          <button className="admin-back-btn" onClick={() => { setViewMode('customer'); changeTab('home'); }}>← বের হোন</button>
          <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
          <span></span>
        </header>

        <div className="admin-tabs">
          <button className={adminTab === 'orders' ? 'active' : ''} onClick={() => { setAdminTab('orders'); fetchAllOrders(); }}>📦 অর্ডারসমূহ</button>
          <button className={adminTab === 'stock' ? 'active' : ''} onClick={() => setAdminTab('stock')}>📊 স্টক ও সেটিংস</button>
        </div>

        <div className="admin-content">
          {/* ORDERS TAB */}
          {adminTab === 'orders' && (
            <>
              <h3 className="section-title">অর্ডার ম্যানেজমেন্ট</h3>
              <div className="order-filters">
                {['All', 'Pending', 'Confirmed', 'On Delivery', 'Delivered', 'Cancelled'].map(s => (
                  <button key={s} className={adminOrderFilter === s ? 'active' : ''} onClick={() => setAdminOrderFilter(s)}>{s}</button>
                ))}
              </div>
              {isAdminLoading ? (
                <div className="loading-spinner">⏳ লোড হচ্ছে...</div>
              ) : (
                <div className="orders-list">
                  {allOrders.filter(o => adminOrderFilter === 'All' || o.status === adminOrderFilter).map(order => (
                    <div key={order.id} className={`admin-order-card ${getStatusClass(order.status)}`}>
                      <div className="o-header">
                        <strong>#{order.id.slice(-6).toUpperCase()}</strong>
                        <span className="o-date">{order.date}</span>
                      </div>
                      <p><b>নাম:</b> {order.userInfo?.name} &nbsp;|&nbsp; <b>মোবাইল:</b> {order.userInfo?.phone}</p>
                      <p><b>ঠিকানা:</b> {order.userInfo?.finalLocation}, {order.userInfo?.address}, {order.userInfo?.area}, {order.userInfo?.district}</p>
                      <p className="o-items-text"><b>পণ্য:</b> {order.items?.map(i => `${i.name} (${i.qty}${parseUnitStr(i.unit).text})`).join(', ')}</p>
                      <p><b>পেমেন্ট:</b> <span className="highlight-text">{order.paymentMethod}</span> &nbsp;|&nbsp; <b>মোট:</b> ৳{order.total}</p>
                      {(order.paymentMethod === 'Bkash' || order.paymentMethod === 'Nogod') && (
                        <p className="trx-box">TrxID: {order.userInfo?.transactionId} | Sender: {order.userInfo?.senderNumber}</p>
                      )}
                      <div className="status-updater">
                        <label>স্টেটাস পরিবর্তন:</label>
                        <select className={`status-select ${getStatusClass(order.status)}`} value={order.status}
                          onChange={async (e) => {
                            await updateDoc(doc(db, "orders", order.id), { status: e.target.value });
                            fetchAllOrders();
                          }}>
                          <option value="Pending">Pending ⏳</option>
                          <option value="Confirmed">Confirmed ✅</option>
                          <option value="On Delivery">On Delivery 🚚</option>
                          <option value="Delivered">Delivered 🏁</option>
                          <option value="Cancelled">Cancelled ❌</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  {allOrders.filter(o => adminOrderFilter === 'All' || o.status === adminOrderFilter).length === 0 && (
                    <p className="empty-text">এই ক্যাটাগরিতে কোনো অর্ডার নেই।</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* STOCK & SETTINGS TAB */}
          {adminTab === 'stock' && (
            <div className="admin-grid-layout">
              {/* Left Column - Settings */}
              <div className="admin-col">
                <div className="admin-card">
                  <h4>🖼️ হেডার ছবি (Facebook Cover)</h4>
                  <input type="text" placeholder="ছবির লিঙ্ক (URL)..." value={headerImage} onChange={e => setHeaderImage(e.target.value)} />
                  <h4 className="mt-15">📢 চলমান নোটিশ</h4>
                  <textarea placeholder="নোটিশ লিখুন..." value={scrollingNotice} onChange={e => setScrollingNotice(e.target.value)} />
                  <button className="btn-primary mt-10" onClick={saveGeneralSettings}>সেভ করুন</button>
                </div>
                <div className="admin-card mt-10">
                  <h4>🔔 পুশ নোটিফিকেশন</h4>
                  <input type="text" placeholder="নোটিফিকেশন মেসেজ..." value={newNotif.text} onChange={e => setNewNotif({ ...newNotif, text: e.target.value })} />
                  <input type="number" placeholder="কত মিনিট স্থায়ী হবে?" className="mt-10" value={newNotif.durationMins} onChange={e => setNewNotif({ ...newNotif, durationMins: +e.target.value })} />
                  <button className="btn-warning mt-10" onClick={pushNotification}>সেন্ড করুন</button>
                </div>
              </div>

              {/* Right Column - Products */}
              <div className="admin-col">
                <div className="admin-card">
                  <h3 className="text-green">{editId ? "✏️ এডিট পণ্য" : "➕ নতুন পণ্য যোগ"}</h3>
                  <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({ ...newP, name: e.target.value })} className="mb-10" />
                  <div className="flex-row gap-10 mb-10">
                    <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({ ...newP, price: e.target.value })} />
                    <input type="text" placeholder="পরিমাণ (১ কেজি, ডজন...)" value={newP.unit} onChange={e => setNewP({ ...newP, unit: e.target.value })} />
                  </div>
                  <div className="flex-row gap-10 mb-10">
                    <select value={newP.category} onChange={e => setNewP({ ...newP, category: e.target.value })}>
                      {categoriesList.filter(c => c !== 'সব পণ্য').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" placeholder="স্টক সংখ্যা" value={newP.stock} onChange={e => setNewP({ ...newP, stock: +e.target.value })} />
                  </div>
                  <input type="text" placeholder="ছবির লিংক (URL)" value={newP.image} onChange={e => setNewP({ ...newP, image: e.target.value })} className="mb-10" />
                  <div className="flex-row gap-10">
                    <button className="btn-primary flex-1" onClick={saveProduct}>{editId ? "আপডেট করুন" : "যোগ করুন"}</button>
                    {editId && <button className="btn-danger" onClick={() => { setEditId(null); setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১ কেজি' }); }}>বাতিল</button>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stock List (always visible in stock tab) */}
          {adminTab === 'stock' && (
            <>
              <h3 className="section-title mt-20">স্টক লিস্ট</h3>
              <div className="stock-list-grid">
                {products.map(p => (
                  <div key={p.id} className="stock-item-row">
                    <img src={p.image || 'https://placehold.co/50x50/27ae60/fff?text=P'} alt={p.name} />
                    <div className="si-details">
                      <strong>{p.name}</strong>
                      <p>৳{p.price} / {p.unit} | স্টক: {p.stock}</p>
                    </div>
                    <button className="btn-edit" onClick={() => { setEditId(p.id); setNewP(p); window.scrollTo(0, 0); }}>Edit</button>
                    <button className="btn-del" onClick={async () => { if (window.confirm("ডিলিট করবেন?")) { await deleteDoc(doc(db, "products", p.id)); fetchProducts(); } }}>Del</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // CUSTOMER VIEW
  // =========================================================================
  return (
    <div className="app-container">
      {/* Toast */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Notification Modal */}
      {showNotificationModal && (
        <div className="modal-bg" onClick={() => setShowNotificationModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="text-green mb-10">🔔 নতুন নোটিফিকেশন</h3>
            <p>{notification.text}</p>
            <button className="btn-primary mt-20" onClick={() => setShowNotificationModal(false)}>ঠিক আছে</button>
          </div>
        </div>
      )}

      {/* Side Drawer Overlay */}
      <div className={`drawer-overlay ${isDrawerOpen ? 'active' : ''}`} onClick={() => setIsDrawerOpen(false)} />
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-head">
          <span>🌿 সাকিব স্টোর</span>
          <button className="drawer-close" onClick={() => setIsDrawerOpen(false)}>✕</button>
        </div>
        <ul className="drawer-menu">
          <li onClick={() => { changeTab('home'); setIsDrawerOpen(false); }}>🏠 হোম</li>
          <li onClick={() => { changeTab('profile'); setIsDrawerOpen(false); }}>👤 প্রোফাইল</li>
          <li onClick={() => { window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html', '_blank'); setIsDrawerOpen(false); }}>🚀 App Update</li>
          <li onClick={() => { changeTab('about'); setIsDrawerOpen(false); }}>ℹ️ About Us</li>
          <li className="admin-menu-link" onClick={() => { setViewMode('adminLogin'); setIsDrawerOpen(false); }}>🛡️ অ্যাডমিন প্যানেল</li>
        </ul>
      </div>

      {/* Header */}
      <header className="main-header" style={{ backgroundImage: `url(${headerImage})` }}>
        <div className="header-overlay">
          <button className="icon-btn" onClick={() => setIsDrawerOpen(true)}>☰</button>
          <div className="header-title">সাকিব স্টোর</div>
          <div className="right-icons">
            {notification.show && (
              <button className="icon-btn notif-bell" onClick={() => setShowNotificationModal(true)}>
                🔔<span className="notif-dot" />
              </button>
            )}
            <button className="icon-btn cart-icon-btn" onClick={() => changeTab('cart')}>
              🛒
              {cart.length > 0 && <span className="cart-badge">{toBanglaNum(cart.length)}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Scrolling Notice - FIX: replaced deprecated <marquee> with CSS animation */}
      <div className="marquee-wrapper">
        <div className="marquee-track">
          <span>📢 {scrollingNotice} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 📢 {scrollingNotice}</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="main-content">

        {/* HOME TAB */}
        {activeTab === 'home' && (
          <div className="page-home">
            <div className="search-wrapper">
              <input type="text" placeholder="যে কোন কিছু সার্চ করুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <span className="search-icon">🔍</span>
            </div>
            <div className="horizontal-categories">
              {categoriesList.map(c => (
                <button key={c} className={`cat-pill ${selectedCat === c ? 'active' : ''}`}
                  onClick={() => { setSelectedCat(c); changeTab('categories'); }}>
                  {c}
                </button>
              ))}
            </div>
            <div className="product-grid-3">
              {products
                .filter(p => searchTerm === '' || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price;
                  const isOutOfStock = p.stock <= 0;
                  return (
                    <div key={p.id} className={`product-card ${isOutOfStock ? 'out-of-stock' : ''}`}>
                      <div className="p-img-box">
                        <img src={p.image || 'https://placehold.co/120x120/e8f5e9/27ae60?text=P'} alt={p.name} />
                      </div>
                      <h4 className="p-name">{p.name}</h4>
                      <p className="p-price">৳{toBanglaNum(currentPrice)}</p>
                      <p className="p-unit">{p.unit}</p>
                      <p className={`p-stock ${isOutOfStock ? 'text-red' : ''}`}>
                        স্টক: {isOutOfStock ? 'শেষ' : toBanglaNum(p.stock)}
                      </p>
                      <div className="p-action">
                        {cItem ? (
                          <div className="qty-controls">
                            <button className="btn-minus" onClick={() => handleCart(p, 'remove')}>-</button>
                            <span className="qty-text">{toBanglaNum(cItem.qty)}</span>
                            <button className="btn-plus" onClick={() => handleCart(p, 'add')}>+</button>
                          </div>
                        ) : (
                          <button disabled={isOutOfStock} className={`btn-add ${isOutOfStock ? 'disabled' : ''}`} onClick={() => handleCart(p, 'add')}>
                            {isOutOfStock ? 'স্টক নেই' : 'যোগ করুন'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* CATEGORIES TAB */}
        {activeTab === 'categories' && (
          <div className="page-categories">
            <div className="cat-sidebar">
              {categoriesList.map(c => (
                <div key={c} className={`cat-side-item ${selectedCat === c ? 'active' : ''}`} onClick={() => setSelectedCat(c)}>
                  {c}
                </div>
              ))}
            </div>
            <div className="cat-content">
              <h3 className="cat-title">{selectedCat}</h3>
              <div className="product-grid-2">
                {products.filter(p => selectedCat === 'সব পণ্য' || p.category === selectedCat).map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price;
                  const isOutOfStock = p.stock <= 0;
                  return (
                    <div key={p.id} className={`product-card ${isOutOfStock ? 'out-of-stock' : ''}`}>
                      <div className="p-img-box"><img src={p.image || 'https://placehold.co/120x120/e8f5e9/27ae60?text=P'} alt={p.name} /></div>
                      <h4 className="p-name">{p.name}</h4>
                      <p className="p-price">৳{toBanglaNum(currentPrice)}</p>
                      <p className="p-unit">{p.unit}</p>
                      <div className="p-action mt-auto">
                        {cItem ? (
                          <div className="qty-controls">
                            <button className="btn-minus" onClick={() => handleCart(p, 'remove')}>-</button>
                            <span className="qty-text">{toBanglaNum(cItem.qty)}</span>
                            <button className="btn-plus" onClick={() => handleCart(p, 'add')}>+</button>
                          </div>
                        ) : (
                          <button disabled={isOutOfStock} className={`btn-add ${isOutOfStock ? 'disabled' : ''}`} onClick={() => handleCart(p, 'add')}>
                            {isOutOfStock ? 'স্টক নেই' : 'যোগ করুন'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CART TAB */}
        {activeTab === 'cart' && (
          <div className="page-cart">
            <h2 className="section-title text-center">আপনার কার্ট 🛒</h2>
            {cart.length === 0 ? (
              <div className="empty-state text-center mt-30">
                <div className="empty-icon">🛒</div>
                <p>আপনার কার্ট খালি!</p>
                <button className="btn-primary mt-10" onClick={() => changeTab('home')}>পণ্য বাছাই করুন</button>
              </div>
            ) : (
              <div className="cart-checkout-wrapper">
                <div className="cart-items-list">
                  {cart.map(item => (
                    <div key={item.id} className="cart-item">
                      <img src={item.image || 'https://placehold.co/50x50/e8f5e9/27ae60?text=P'} alt={item.name} className="cart-item-img" />
                      <div className="c-info">
                        <strong>{item.name}</strong>
                        <p className="text-muted">{toBanglaNum(item.qty)}{parseUnitStr(item.unit).text}</p>
                      </div>
                      <div className="c-right">
                        <div className="c-price">৳{toBanglaNum((item.price / parseUnitStr(item.unit).baseQty) * item.qty)}</div>
                        <div className="qty-controls small">
                          <button className="btn-minus" onClick={() => handleCart(item, 'remove')}>-</button>
                          <span className="qty-text">{toBanglaNum(item.qty)}</span>
                          <button className="btn-plus" onClick={() => handleCart(item, 'add')}>+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="checkout-form mt-20">
                  <h3 className="sub-title">📍 কোথায় ডেলিভারি নিবেন?</h3>
                  <div className="selector-grid">
                    {deliveryLocations.map(loc => (
                      <button key={loc} className={`select-box ${userInfo.locationType === loc ? 'active' : ''}`}
                        onClick={() => setUserInfo({ ...userInfo, locationType: loc })}>
                        {loc}
                        {loc !== 'নিজে লেখুন' && <span className="charge-hint">৳{getDeliveryCharge(loc)}</span>}
                      </button>
                    ))}
                  </div>
                  {userInfo.locationType === 'নিজে লেখুন' && (
                    <input type="text" className="custom-input mt-10" placeholder="আপনার জায়গার নাম লিখুন..."
                      value={customLocation} onChange={e => setCustomLocation(e.target.value)} />
                  )}

                  <h3 className="sub-title mt-20">🚚 ডেলিভারি তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম *" value={userInfo.name} onChange={e => setUserInfo({ ...userInfo, name: e.target.value })} />
                    <input type="number" placeholder="মোবাইল নম্বর *" value={userInfo.phone} onChange={e => setUserInfo({ ...userInfo, phone: e.target.value })} />
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা *" value={userInfo.district} onChange={e => setUserInfo({ ...userInfo, district: e.target.value })} />
                      <input type="text" placeholder="থানা/উপজেলা *" value={userInfo.area} onChange={e => setUserInfo({ ...userInfo, area: e.target.value })} />
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং *" value={userInfo.address} onChange={e => setUserInfo({ ...userInfo, address: e.target.value })} />
                  </div>

                  <h3 className="sub-title mt-20">💳 পেমেন্ট পদ্ধতি</h3>
                  <div className="selector-grid cols-3">
                    {['Bkash', 'Nogod', 'Cash on Delivery'].map(pm => (
                      <button key={pm} className={`select-box payment-box ${userInfo.paymentMethod === pm ? 'active' : ''}`}
                        onClick={() => setUserInfo({ ...userInfo, paymentMethod: pm })}>
                        {pm === 'Bkash' ? '💗 Bkash' : pm === 'Nogod' ? '🔴 Nogod' : '💵 Cash on Delivery'}
                      </button>
                    ))}
                  </div>
                  {(userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nogod') && (
                    <div className="payment-instructions mt-10">
                      <p className="pay-number">📲 Personal Number: <strong>01723539738</strong></p>
                      <p className="text-muted text-sm mb-10">উপরের নম্বরে Send Money করুন, তারপর নিচের তথ্য দিন:</p>
                      <input type="number" placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন *"
                        value={userInfo.senderNumber} onChange={e => setUserInfo({ ...userInfo, senderNumber: e.target.value })} className="mb-10" />
                      <input type="text" placeholder="Transaction ID (TrxID) *"
                        value={userInfo.transactionId} onChange={e => setUserInfo({ ...userInfo, transactionId: e.target.value })} />
                    </div>
                  )}

                  <div className="bill-summary mt-20">
                    <div className="bill-row"><span>পণ্যের দাম:</span><span>৳{toBanglaNum(totalCartPrice)}</span></div>
                    <div className="bill-row"><span>ডেলিভারি চার্জ:</span><span>৳{toBanglaNum(deliveryCharge)}</span></div>
                    <div className="bill-row total"><span>মোট বিল:</span><span>৳{toBanglaNum(finalTotal)}</span></div>
                  </div>
                  <button className="btn-confirm-order mt-20" onClick={submitOrder}>
                    ✅ অর্ডার নিশ্চিত করুন (৳{toBanglaNum(finalTotal)})
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="page-profile">
            {!user ? (
              <div className="auth-screen text-center">
                <div className="auth-logo">🛒</div>
                <h2 className="mb-10">লগইন করুন</h2>
                <p className="text-muted mb-20">অর্ডার ট্র্যাক করতে এবং তথ্য সেভ রাখতে লগইন করুন।</p>
                <button className="btn-google mb-15" onClick={handleGoogleLogin}>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" width="20" />
                  Google দিয়ে লগইন (One Tap)
                </button>
                <div className="divider">অথবা</div>
                <button className="btn-outline mt-15" onClick={handleGuestLogin}>
                  👤 গেস্ট হিসেবে প্রবেশ করুন
                </button>
                <p className="text-muted mt-20 text-sm">Google লগইন করলে আপনার ডেটা চিরস্থায়ী সেভ থাকবে।</p>
              </div>
            ) : (
              <div className="profile-dashboard">
                {/* Cover & Avatar */}
                <div className="profile-header-box">
                  <div className="cover-photo" style={{ backgroundImage: `url(${userInfo.coverPic || 'https://placehold.co/400x150/27ae60/fff?text=Cover'})` }}>
                    <label className="upload-btn cover-upload">
                      📷 কভার পরিবর্তন
                      <input type="file" hidden accept="image/*" onChange={e => handleImageUpload(e, 'coverPic')} />
                    </label>
                  </div>
                  <div className="avatar-section">
                    <div className="avatar" style={{ backgroundImage: `url(${userInfo.profilePic || 'https://placehold.co/100x100/27ae60/fff?text=👤'})` }}>
                      <label className="upload-btn avatar-upload">
                        📷<input type="file" hidden accept="image/*" onChange={e => handleImageUpload(e, 'profilePic')} />
                      </label>
                    </div>
                    <div className="user-titles">
                      <h3>{userInfo.name || (user.isAnonymous ? 'গেস্ট ইউজার' : 'আপনার নাম দিন')}</h3>
                      <p>{user.email || (user.isAnonymous ? 'গেস্ট অ্যাকাউন্ট' : '')}</p>
                    </div>
                  </div>
                </div>

                {/* Edit Profile */}
                <div className="profile-edit-card mt-20">
                  <h3 className="sub-title">✏️ আপনার তথ্য (এডিট করা যাবে)</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({ ...userInfo, name: e.target.value })} />
                    <input type="number" placeholder="মোবাইল নম্বর" value={userInfo.phone} onChange={e => setUserInfo({ ...userInfo, phone: e.target.value })} />
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({ ...userInfo, district: e.target.value })} />
                      <input type="text" placeholder="থানা/উপজেলা" value={userInfo.area} onChange={e => setUserInfo({ ...userInfo, area: e.target.value })} />
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={userInfo.address} onChange={e => setUserInfo({ ...userInfo, address: e.target.value })} />
                    <button className="btn-primary mt-10" onClick={() => saveProfileData()}>💾 তথ্য সেভ করুন</button>
                  </div>
                </div>

                {/* Order History */}
                <div className="order-history mt-20">
                  <h3 className="sub-title">📦 আপনার অর্ডার সমূহ ({userOrders.length})</h3>
                  {userOrders.length === 0 ? (
                    <p className="text-muted">কোনো অর্ডার নেই।</p>
                  ) : (
                    userOrders.map(o => (
                      <div key={o.id} className={`history-card ${getStatusClass(o.status)}`}>
                        <div className="hc-head">
                          <strong>Order #{o.id.slice(-6).toUpperCase()}</strong>
                          <span className={`badge-status ${getStatusClass(o.status)}`}>{o.status}</span>
                        </div>
                        <p className="text-sm text-muted">{o.date}</p>
                        <p className="mt-5"><b>পণ্য:</b> {o.items?.map(i => `${i.name} (${i.qty})`).join(', ')}</p>
                        <p><b>মোট বিল:</b> ৳{toBanglaNum(o.total)}</p>
                      </div>
                    ))
                  )}
                </div>

                <button className="btn-danger w-full mt-20" onClick={handleLogout}>🚪 লগ আউট করুন</button>
              </div>
            )}
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === 'about' && (
          <div className="about-view">
            <h2 className="text-green mb-20">About Us</h2>
            <div className="about-logo">🌿</div>
            <h3 className="mb-10">সাকিব স্টোর</h3>
            <p className="about-desc">সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। আমরা সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            <div className="contact-box mt-30">
              <p className="contact-title">📞 যোগাযোগ:</p>
              <p>০১৭২৪৪০৯২১৯</p>
              <p>০১৭৩৫৩৭৬০৭৯</p>
              <p>০১৭২৩৫৩৯৭৩৮</p>
            </div>
          </div>
        )}

      </main>

      {/* Bottom Navigation */}
      <footer className="bottom-nav">
        <div className={`nav-icon ${activeTab === 'home' ? 'active' : ''}`} onClick={() => changeTab('home')}>
          <span>🏠</span><span>হোম</span>
        </div>
        <div className={`nav-icon ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => changeTab('categories')}>
          <span>🗂️</span><span>ক্যাটাগরি</span>
        </div>
        <div className={`nav-icon cart-nav ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => changeTab('cart')}>
          <span>🛒</span><span>কার্ট</span>
          {cart.length > 0 && <span className="nav-badge">{toBanglaNum(cart.length)}</span>}
        </div>
        <div className={`nav-icon ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => changeTab('profile')}>
          <span>👤</span><span>প্রোফাইল</span>
        </div>
      </footer>
    </div>
  );
}

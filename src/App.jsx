import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, getDoc, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import './App.css';

// --- ফায়ারবেস কনফিগারেশন ---
const firebaseConfig = {
  apiKey: "AIzaSyBSKT0kmhfyLHSur-Z8nnj3jrYn2KBcP0M",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// --- হেল্পার ফাংশন ---
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
    } else {
      stepAmount = 1;
    }
    return { baseQty: num, text: txt, step: stepAmount };
  }
  return { baseQty: 1, text: unitStr, step: 1 };
};

const toBanglaNum = (num) => {
  if (!num && num !== 0) return '০';
  return Number(num).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
};

// --- ডেলিভারি চার্জ লজিক ---
const deliveryLocations = [
  "গোবিন্দল", "সিংগাইর বাজার", "নীলটেক", "পুকুরপাড়া", "ঘোনাপাড়া", "বকচর",
  "সিংগাইর উপজেলার ভেতরে", "নিজে লেখুন"
];

const getDeliveryCharge = (locationName) => {
  const twentyTakaAreas = ["গোবিন্দল", "সিংগাইর বাজার", "নীলটেক", "পুকুরপাড়া", "ঘোনাপাড়া", "বকচর"];
  if (twentyTakaAreas.includes(locationName)) return 20;
  if (locationName === "সিংগাইর উপজেলার ভেতরে") return 40;
  if (locationName === "নিজে লেখুন") return 50; 
  return 50; 
};

const getStatusColor = (status) => {
  switch (status) {
    case 'Pending': return 'st-pending';
    case 'Confirmed': return 'st-confirmed';
    case 'On Delivery': return 'st-delivery';
    case 'Delivered': return 'st-delivered';
    case 'Cancelled': return 'st-cancelled';
    default: return 'st-default';
  }
};

export default function App() {
  const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];

  // Global States
  const [products, setProducts] = useState([]);
  const [headerImage, setHeaderImage] = useState('https://via.placeholder.com/820x312?text=Facebook+Cover+Size');
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম!');
  const [notification, setNotification] = useState({ text: '', expiresAt: 0, show: false });
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState('home');
  const [tabHistory, setTabHistory] = useState(['home']); // For Back Button
  const [viewMode, setViewMode] = useState('customer');
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [adminTab, setAdminTab] = useState('orders');
  const [adminOrderFilter, setAdminOrderFilter] = useState('All');

  // User & Cart States
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [customLocation, setCustomLocation] = useState('');
  const [userInfo, setUserInfo] = useState({
    name: '', phone: '', locationType: 'গোবিন্দল', district: 'মানিকগঞ্জ', area: 'সিংগাইর', address: '', paymentMethod: 'Cash on Delivery', senderNumber: '', transactionId: '',
    profilePic: 'https://via.placeholder.com/100', coverPic: 'https://via.placeholder.com/400x150'
  });

  // Admin States
  const [adminPass, setAdminPass] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  const [editId, setEditId] = useState(null);
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'সব পণ্য', stock: 100, unit: '১ কেজি' });
  const [newNotif, setNewNotif] = useState({ text: '', durationMins: 60 });

  // Double Back Press Logic
  const backPressTime = useRef(0);

  // Initial Load
  useEffect(() => {
    fetchProducts();
    fetchSettings();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser({ id: currentUser.uid, isAnonymous: currentUser.isAnonymous, email: currentUser.email });
        loadUserData(currentUser.uid);
      } else {
        setUser(null);
        // Load temp data from local storage if not logged in
        const localData = localStorage.getItem('tempUserInfo');
        if(localData) setUserInfo(JSON.parse(localData));
      }
    });

    // Handle Hardware/Browser Back Button
    window.history.pushState(null, null, window.location.pathname);
    const handlePopState = (e) => {
      window.history.pushState(null, null, window.location.pathname); // Block default back
      
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        return;
      }

      setTabHistory(prevHistory => {
        if (prevHistory.length > 1) {
          const newHistory = [...prevHistory];
          newHistory.pop(); // Remove current
          const previousTab = newHistory[newHistory.length - 1];
          setActiveTab(previousTab);
          return newHistory;
        } else {
          // Double back to exit logic
          const currentTime = new Date().getTime();
          if (currentTime - backPressTime.current < 2000) {
            window.close(); // Tries to close app
            alert("Please close the app manually."); // Fallback
          } else {
            backPressTime.current = currentTime;
            alert('অ্যাপ থেকে বের হতে ২ বার Back চাপুন');
          }
          return prevHistory;
        }
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isDrawerOpen]);

  // Handle Tab Change with History
  const changeTab = (tabName) => {
    setActiveTab(tabName);
    setTabHistory(prev => [...prev, tabName]);
    window.scrollTo(0,0);
  };

  const fetchProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { console.error("Error fetching products", e); }
  };

  const fetchSettings = async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "general"));
      if (snap.exists()) {
        const data = snap.data();
        if(data.header) setHeaderImage(data.header);
        if(data.notice) setScrollingNotice(data.notice);
        if(data.notification) {
          const isExpired = Date.now() > data.notification.expiresAt;
          setNotification({ ...data.notification, show: !isExpired });
        }
      }
    } catch (e) { console.error("Error fetching settings", e); }
  };

  const loadUserData = async (uid) => {
    try {
      const uSnap = await getDoc(doc(db, "users", uid));
      if (uSnap.exists() && uSnap.data().info) {
        setUserInfo(prev => ({ ...prev, ...uSnap.data().info }));
      }
      const oSnap = await getDocs(query(collection(db, "orders"), where("userId", "==", uid)));
      setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) { console.error("Error loading user data", e); }
  };

  // --- Auth Functions ---
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      alert("গুগল লগইন সফল!");
      changeTab('home');
    } catch (e) { alert("লগইন বাতিল হয়েছে: " + e.message); }
  };

  const handleGuestLogin = async () => {
    try {
      await signInAnonymously(auth);
      alert("গেস্ট হিসেবে প্রবেশ করেছেন!");
      changeTab('home');
    } catch (e) { alert("সমস্যা: " + e.message); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserInfo({ name: '', phone: '', locationType: 'গোবিন্দল', district: 'মানিকগঞ্জ', area: 'সিংগাইর', address: '', paymentMethod: 'Cash on Delivery', profilePic: 'https://via.placeholder.com/100', coverPic: 'https://via.placeholder.com/400x150' });
    setCart([]);
    changeTab('home');
  };

  // Image Upload Logic (Firebase Storage)
  const handleImageUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    
    alert("ছবি আপলোড হচ্ছে, অপেক্ষা করুন...");
    const storageRef = ref(storage, `users/${user.id}/${type}_${Date.now()}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', null, (error) => alert(error.message), async () => {
      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      const updatedInfo = { ...userInfo, [type]: downloadURL };
      setUserInfo(updatedInfo);
      await saveProfileData(updatedInfo);
      alert("ছবি আপডেট হয়েছে!");
    });
  };

  const saveProfileData = async (dataToSave = userInfo) => {
    if (user) {
      await setDoc(doc(db, "users", user.id), { info: dataToSave }, { merge: true });
      alert('প্রোফাইল আপডেট হয়েছে!');
    } else {
      localStorage.setItem('tempUserInfo', JSON.stringify(dataToSave));
      alert('তথ্য সাময়িকভাবে সেভ হয়েছে! লগইন করলে স্থায়ী হবে।');
    }
  };

  // --- Cart & Order Logic ---
  const handleCart = (product, action) => {
    if (action === 'add' && product.stock <= 0) return alert("পণ্যটি স্টকে নেই!");
    
    const { baseQty, step } = parseUnitStr(product.unit);
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id);
      if (action === 'add') {
        if (existing) {
          if ((existing.qty + step) > (product.stock * baseQty)) return prevCart; 
          return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty + step } : item);
        }
        return [...prevCart, { ...product, qty: baseQty }];
      }
      if (action === 'remove' && existing) {
        if (existing.qty > baseQty) return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty - step } : item);
        return prevCart.filter(item => item.id !== product.id);
      }
      return prevCart;
    });
  };

  const totalCartPrice = cart.reduce((acc, item) => {
    const { baseQty } = parseUnitStr(item.unit);
    return acc + (item.price / baseQty) * item.qty;
  }, 0);
  const deliveryCharge = cart.length > 0 ? getDeliveryCharge(userInfo.locationType) : 0;
  const finalTotal = totalCartPrice + deliveryCharge;

  const submitOrder = async () => {
    if (!userInfo.name || !userInfo.phone || !userInfo.district || !userInfo.area || !userInfo.address) {
      return alert("দয়া করে ডেলিভারির জন্য সকল তথ্য দিন!");
    }
    const finalLocationName = userInfo.locationType === 'নিজে লেখুন' ? customLocation : userInfo.locationType;
    if (userInfo.locationType === 'নিজে লেখুন' && !customLocation) return alert("দয়া করে ডেলিভারির জায়গার নাম লিখুন!");

    if ((userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nogod') && (!userInfo.senderNumber || !userInfo.transactionId)) {
      return alert("বিকাশ/নগদ পেমেন্টের ক্ষেত্রে সেন্ডার নম্বর এবং TrxID দেওয়া বাধ্যতামূলক!");
    }

    const orderData = {
      items: cart,
      userInfo: { ...userInfo, finalLocation: finalLocationName },
      userId: user?.id || 'Guest_' + Date.now(),
      paymentMethod: userInfo.paymentMethod,
      total: finalTotal,
      status: 'Pending',
      date: new Date().toLocaleString(),
      timestamp: Date.now()
    };

    try {
      await addDoc(collection(db, "orders"), orderData);
      
      // Update Stock
      cart.forEach(async (item) => {
        const { baseQty } = parseUnitStr(item.unit);
        const purchasedAmount = item.qty / baseQty;
        const newStock = Math.max(0, item.stock - purchasedAmount);
        await updateDoc(doc(db, "products", item.id), { stock: newStock });
      });

      if (user) await setDoc(doc(db, "users", user.id), { info: userInfo }, { merge: true });

      alert(`অর্ডার সফল! আপনার পেমেন্ট মেথড: ${userInfo.paymentMethod}`);
      setCart([]);
      fetchProducts();
      changeTab('profile');
      if (user) loadUserData(user.id);
    } catch (e) { alert("সমস্যা হয়েছে: " + e.message); }
  };

  // --- Admin Logic ---
  const fetchAllOrders = async () => {
    try {
      const snap = await getDocs(collection(db, "orders"));
      setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.timestamp - a.timestamp));
    } catch(e) { console.error("Admin fetch error", e); alert("ডেটা লোড হতে সমস্যা হচ্ছে!"); }
  };

  const saveProduct = async () => {
    if (!newP.name || !newP.price) return alert("দয়া করে নাম ও দাম দিন!");
    try {
      if (editId) {
        await updateDoc(doc(db, "products", editId), newP);
        alert("আপডেট হয়েছে!");
      } else {
        await addDoc(collection(db, "products"), newP);
        alert("যোগ হয়েছে!");
      }
      setEditId(null);
      setNewP({ name: '', price: '', image: '', category: 'সব পণ্য', stock: 100, unit: '১ কেজি' });
      fetchProducts();
    } catch (error) { alert(error.message); }
  };

  const pushNotification = async () => {
    if(!newNotif.text) return;
    const expiresAt = Date.now() + (newNotif.durationMins * 60000);
    const notifData = { text: newNotif.text, expiresAt };
    await setDoc(doc(db, "settings", "general"), { notification: notifData }, { merge: true });
    setNotification({ ...notifData, show: true });
    alert("নোটিফিকেশন পাঠানো হয়েছে!");
  };

  const saveGeneralSettings = async () => {
    await setDoc(doc(db, "settings", "general"), { header: headerImage, notice: scrollingNotice }, { merge: true });
    alert("সেটিংস সেভ হয়েছে!");
  };


  // =========================================================================
  // ADMIN VIEW RENDER
  // =========================================================================
  if (viewMode === 'adminLogin') {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-box">
          <h2>🛡️ অ্যাডমিন লগইন</h2>
          <input type="password" placeholder="পাসওয়ার্ড..." value={adminPass} onChange={e => setAdminPass(e.target.value)} />
          <button className="btn-primary" onClick={() => { if (adminPass === 'sakib123') { setViewMode('admin'); fetchAllOrders(); setAdminPass(''); } else alert('ভুল পাসওয়ার্ড!'); }}>লগইন</button>
          <button className="btn-outline mt-15" onClick={() => {setViewMode('customer'); changeTab('home');}}>ফিরে যান</button>
        </div>
      </div>
    );
  }

  if (viewMode === 'admin') {
    return (
      <div className="admin-panel">
        <header className="admin-header">
          <button onClick={() => setViewMode('customer')}>⬅ বের হোন</button>
          <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
        </header>

        <div className="admin-tabs">
          <button className={adminTab === 'orders' ? 'active' : ''} onClick={() => { setAdminTab('orders'); fetchAllOrders(); }}>📦 অর্ডারসমূহ</button>
          <button className={adminTab === 'stock' ? 'active' : ''} onClick={() => setAdminTab('stock')}>📊 স্টক ও সেটিংস</button>
        </div>

        {adminTab === 'orders' ? (
          <div className="admin-content">
            <h3 className="section-title">অর্ডার ম্যানেজমেন্ট</h3>
            <div className="order-filters">
              {['All', 'Pending', 'Confirmed', 'On Delivery', 'Delivered', 'Cancelled'].map(s => (
                <button key={s} className={adminOrderFilter === s ? 'active' : ''} onClick={() => setAdminOrderFilter(s)}>{s}</button>
              ))}
            </div>

            <div className="orders-list">
              {allOrders.filter(o => adminOrderFilter === 'All' || o.status === adminOrderFilter).map(order => (
                <div key={order.id} className="admin-order-card">
                  <div className="o-header">
                    <strong>আইডি: #{order.id.slice(-5).toUpperCase()}</strong>
                    <span>{order.date}</span>
                  </div>
                  <p><b>নাম:</b> {order.userInfo?.name} ({order.userInfo?.phone})</p>
                  <p><b>ঠিকানা:</b> {order.userInfo?.finalLocation}, {order.userInfo?.address}, {order.userInfo?.area}, {order.userInfo?.district}</p>
                  <div className="o-items">
                    <b>পণ্য:</b> {order.items?.map(i => `${i.name} (${i.qty}${parseUnitStr(i.unit).text})`).join(', ')}
                  </div>
                  <p><b>পেমেন্ট:</b> <span className="highlight-text">{order.paymentMethod}</span> | <b>মোট:</b> ৳{order.total}</p>
                  {(order.paymentMethod === 'Bkash' || order.paymentMethod === 'Nogod') && (
                    <p className="trx-box">TrxID: {order.userInfo?.transactionId} | Sender: {order.userInfo?.senderNumber}</p>
                  )}
                  
                  <div className="status-updater">
                    <label>স্টেটাস পরিবর্তন: </label>
                    <select className={`status-select ${getStatusColor(order.status)}`} value={order.status} onChange={async (e) => {
                      const newStatus = e.target.value;
                      await updateDoc(doc(db, "orders", order.id), { status: newStatus });
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
            </div>
          </div>
        ) : (
          <div className="admin-content">
            <div className="admin-grid-layout">
              {/* Settings Column */}
              <div className="admin-col">
                <div className="admin-card">
                  <h4>🖼️ হেডারের ছবি (Facebook Cover)</h4>
                  <input type="text" placeholder="ছবির লিঙ্ক (URL)..." value={headerImage} onChange={(e) => setHeaderImage(e.target.value)} />
                  <h4 style={{marginTop:'15px'}}>📢 চলমান নোটিশ</h4>
                  <textarea placeholder="নোটিশ লিখুন..." value={scrollingNotice} onChange={(e) => setScrollingNotice(e.target.value)} />
                  <button className="btn-primary mt-10" onClick={saveGeneralSettings}>সেভ করুন</button>
                </div>

                <div className="admin-card">
                  <h4>🔔 পুশ নোটিফিকেশন</h4>
                  <input type="text" placeholder="নোটিফিকেশন মেসেজ..." value={newNotif.text} onChange={(e) => setNewNotif({...newNotif, text: e.target.value})} />
                  <input type="number" placeholder="কত মিনিট স্থায়ী হবে?" value={newNotif.durationMins} onChange={(e) => setNewNotif({...newNotif, durationMins: e.target.value})} style={{marginTop:'10px'}}/>
                  <button className="btn-warning mt-10" onClick={pushNotification}>সেন্ড করুন</button>
                </div>
              </div>

              {/* Product Column */}
              <div className="admin-col">
                <div className="admin-card">
                  <h3 className="text-green">{editId ? "✏️ এডিট পণ্য" : "➕ নতুন পণ্য যোগ"}</h3>
                  <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({ ...newP, name: e.target.value })} className="mb-10" />
                  <div className="flex-row gap-10 mb-10">
                    <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({ ...newP, price: e.target.value })} />
                    <input type="text" placeholder="পরিমাণ (১ কেজি, ডজন, পিচ)" value={newP.unit} onChange={e => setNewP({ ...newP, unit: e.target.value })} />
                  </div>
                  <div className="flex-row gap-10 mb-10">
                    <select value={newP.category} onChange={e => setNewP({ ...newP, category: e.target.value })}>
                      {categoriesList.filter(c => c !== 'সব পণ্য').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" placeholder="স্টক সংখ্যা" value={newP.stock} onChange={e => setNewP({ ...newP, stock: e.target.value })} />
                  </div>
                  <input type="text" placeholder="ছবির লিংক (URL)" value={newP.image} onChange={e => setNewP({ ...newP, image: e.target.value })} className="mb-10" />
                  
                  <div className="flex-row gap-10">
                    <button className="btn-primary flex-1" onClick={saveProduct}>{editId ? "আপডেট করুন" : "যোগ করুন"}</button>
                    {editId && <button className="btn-danger" onClick={() => { setEditId(null); setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১ কেজি' }); }}>বাতিল</button>}
                  </div>
                </div>
              </div>
            </div>

            <h3 className="section-title" style={{marginTop:'30px'}}>স্টক লিস্ট</h3>
            <div className="stock-list-grid">
              {products.map(p => (
                <div key={p.id} className="stock-item-row">
                  <img src={p.image} alt="" />
                  <div className="si-details">
                    <strong>{p.name}</strong>
                    <p>৳{p.price} / {p.unit} | স্টক: {p.stock}</p>
                  </div>
                  <button className="btn-edit" onClick={() => {setEditId(p.id); setNewP(p); window.scrollTo(0,0);}}>Edit</button>
                  <button className="btn-del" onClick={async () => { if (window.confirm("ডিলিট করবেন?")) { await deleteDoc(doc(db, "products", p.id)); fetchProducts(); } }}>Del</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // CUSTOMER VIEW RENDER
  // =========================================================================
  return (
    <div className="app-container">
      
      {/* Header Area (Facebook Cover Style) */}
      <header className="main-header" style={{ backgroundImage: `url(${headerImage})` }}>
        <div className="header-overlay">
          <button className="icon-btn left-icon" onClick={() => setIsDrawerOpen(true)}>☰</button>
          
          <div className="right-icons">
            {notification.show && (
              <button className="icon-btn notif-bell" onClick={() => setShowNotificationModal(true)}>
                🔔 <span className="notif-dot"></span>
              </button>
            )}
            <button className="icon-btn cart-icon" onClick={() => changeTab('cart')}>
              🛒 {cart.length > 0 && <span className="badge">{toBanglaNum(cart.length)}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Notification Modal */}
      {showNotificationModal && (
        <div className="modal-bg" onClick={() => setShowNotificationModal(false)}>
          <div className="modal-box p-20" onClick={e=>e.stopPropagation()}>
            <h3 className="text-green mb-10">🔔 নতুন নোটিফিকেশন</h3>
            <p>{notification.text}</p>
            <button className="btn-primary mt-20" onClick={() => setShowNotificationModal(false)}>ঠিক আছে</button>
          </div>
        </div>
      )}

      {/* Scrolling Notice */}
      <div className="marquee-container">
        <marquee direction="left">📢 {scrollingNotice}</marquee>
      </div>

      {/* Sidebar Drawer */}
      <div className={`drawer-overlay ${isDrawerOpen ? 'active' : ''}`} onClick={() => setIsDrawerOpen(false)}></div>
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-head">সাকিব স্টোর</div>
        <ul className="drawer-menu">
          <li onClick={() => { changeTab('home'); setIsDrawerOpen(false); }}>🏠 হোম</li>
          <li onClick={() => { changeTab('profile'); setIsDrawerOpen(false); }}>👤 প্রোফাইল</li>
          <li onClick={() => { window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html', '_blank'); setIsDrawerOpen(false); }}>🚀 App Update</li>
          <li onClick={() => { changeTab('about'); setIsDrawerOpen(false); }}>ℹ️ About Us</li>
          <li className="admin-menu-link" onClick={() => { setViewMode('adminLogin'); setIsDrawerOpen(false); }}>🛡️ অ্যাডমিন পেনেল</li>
        </ul>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        
        {/* --- HOME TAB --- */}
        {activeTab === 'home' && (
          <div className="page-home">
            {/* Search Bar */}
            <div className="search-wrapper">
              <input type="text" placeholder="যে কোন কিছু সার্চ করুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <span className="search-icon">🔍</span>
            </div>

            {/* Horizontal Categories */}
            <div className="horizontal-categories">
              {categoriesList.map(c => (
                <button key={c} className={`cat-pill ${selectedCat === c ? 'active' : ''}`} onClick={() => { setSelectedCat(c); changeTab('categories'); }}>
                  {c}
                </button>
              ))}
            </div>

            {/* 3 Column Grid */}
            <div className="product-grid-3">
              {products
                .filter(p => searchTerm === '' || p.name.toLowerCase().includes(searchTerm.toLowerCase().trim()))
                .map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price;
                  const isOutOfStock = p.stock <= 0;

                  return (
                    <div key={p.id} className="product-card">
                      <div className="p-img-box"><img src={p.image} alt={p.name} /></div>
                      <h4 className="p-name">{p.name}</h4>
                      <p className="p-price">৳{toBanglaNum(currentPrice)}</p>
                      <p className="p-unit">{p.unit}</p>
                      <p className={`p-stock ${isOutOfStock ? 'text-red' : ''}`}>স্টক: {isOutOfStock ? 'শেষ' : toBanglaNum(p.stock)}</p>
                      
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

        {/* --- CATEGORY TAB --- */}
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
                {products
                  .filter(p => selectedCat === 'সব পণ্য' || p.category === selectedCat)
                  .map(p => {
                    const cItem = cart.find(x => x.id === p.id);
                    const { baseQty } = parseUnitStr(p.unit);
                    const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price;
                    const isOutOfStock = p.stock <= 0;

                    return (
                      <div key={p.id} className="product-card">
                        <div className="p-img-box"><img src={p.image} alt={p.name} /></div>
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

        {/* --- CART & CHECKOUT TAB --- */}
        {activeTab === 'cart' && (
          <div className="page-cart">
            <h2 className="section-title text-center">আপনার কার্ট 🛒</h2>
            
            {cart.length === 0 ? (
              <div className="empty-state text-center mt-30">
                <p>আপনার কার্ট খালি!</p>
                <button className="btn-primary mt-10" onClick={() => changeTab('home')}>পণ্য বাছাই করুন</button>
              </div>
            ) : (
              <div className="cart-checkout-wrapper">
                {/* Cart Items */}
                <div className="cart-items-list">
                  {cart.map(item => (
                    <div key={item.id} className="cart-item">
                      <div className="c-info">
                        <strong>{item.name}</strong>
                        <p className="text-muted">{toBanglaNum(item.qty)}{parseUnitStr(item.unit).text}</p>
                      </div>
                      <div className="c-price">৳{toBanglaNum((item.price / parseUnitStr(item.unit).baseQty) * item.qty)}</div>
                      <div className="qty-controls small">
                        <button className="btn-minus" onClick={() => handleCart(item, 'remove')}>-</button>
                        <span className="qty-text">{toBanglaNum(item.qty)}</span>
                        <button className="btn-plus" onClick={() => handleCart(item, 'add')}>+</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Checkout Form */}
                <div className="checkout-form mt-20">
                  <h3 className="sub-title">কোথায় ডেলিভারি নিবেন?</h3>
                  <div className="selector-grid">
                    {deliveryLocations.map(loc => (
                      <button key={loc} className={`select-box ${userInfo.locationType === loc ? 'active' : ''}`} onClick={() => setUserInfo({...userInfo, locationType: loc})}>
                        {loc}
                      </button>
                    ))}
                  </div>

                  {userInfo.locationType === 'নিজে লেখুন' && (
                    <input type="text" className="custom-input mt-10" placeholder="আপনার জায়গার নাম লিখুন..." value={customLocation} onChange={(e) => setCustomLocation(e.target.value)} />
                  )}

                  <h3 className="sub-title mt-20">ডেলিভারি তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} />
                    <input type="number" placeholder="মোবাইল নম্বর" value={userInfo.phone} onChange={e => setUserInfo({...userInfo, phone: e.target.value})} />
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({...userInfo, district: e.target.value})} />
                      <input type="text" placeholder="থানা/উপজেলা" value={userInfo.area} onChange={e => setUserInfo({...userInfo, area: e.target.value})} />
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={userInfo.address} onChange={e => setUserInfo({...userInfo, address: e.target.value})}></textarea>
                  </div>

                  <h3 className="sub-title mt-20">পেমেন্ট পদ্ধতি</h3>
                  <div className="selector-grid cols-3">
                    {['Bkash', 'Nogod', 'Cash on Delivery'].map(pm => (
                      <button key={pm} className={`select-box ${userInfo.paymentMethod === pm ? 'active' : ''}`} onClick={() => setUserInfo({...userInfo, paymentMethod: pm})}>
                        {pm === 'Cash on Delivery' ? 'Cash On Delivery' : pm}
                      </button>
                    ))}
                  </div>

                  {(userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nogod') && (
                    <div className="payment-instructions mt-10">
                      <p className="text-red font-bold">Personal Number: 01723539738</p>
                      <p className="text-muted text-sm mb-10">উপরের নম্বরে টাকা Send Money করে নিচের তথ্য দিন:</p>
                      <input type="number" placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন" value={userInfo.senderNumber} onChange={e => setUserInfo({...userInfo, senderNumber: e.target.value})} className="mb-10"/>
                      <input type="text" placeholder="Transaction ID (TrxID)" value={userInfo.transactionId} onChange={e => setUserInfo({...userInfo, transactionId: e.target.value})} />
                    </div>
                  )}

                  {/* Bill Summary */}
                  <div className="bill-summary mt-20">
                    <div className="bill-row"><span>পণ্যের দাম:</span> <span>৳{toBanglaNum(totalCartPrice)}</span></div>
                    <div className="bill-row"><span>ডেলিভারি চার্জ:</span> <span>৳{toBanglaNum(deliveryCharge)}</span></div>
                    <div className="bill-row total"><span>মোট বিল:</span> <span>৳{toBanglaNum(finalTotal)}</span></div>
                  </div>

                  <button className="btn-confirm-order mt-20" onClick={submitOrder}>অর্ডার নিশ্চিত করুন (৳{toBanglaNum(finalTotal)})</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
          <div className="page-profile">
            {!user ? (
              <div className="auth-screen text-center p-20">
                <img src="https://cdn-icons-png.flaticon.com/512/295/295128.png" width="80" alt="Login" className="mb-20" />
                <h2 className="mb-20">লগইন করুন</h2>
                <button className="btn-google mb-15" onClick={handleGoogleLogin}>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" width="20"/> Google দিয়ে লগইন
                </button>
                <div className="divider">অথবা</div>
                <button className="btn-outline mt-15" onClick={handleGuestLogin}>গেস্ট হিসেবে প্রবেশ করুন</button>
                <p className="text-muted mt-20 text-sm">গুগল দিয়ে লগইন করলে আপনার ডেটা চিরস্থায়ী সেভ থাকবে।</p>
              </div>
            ) : (
              <div className="profile-dashboard">
                {/* Profile Headers */}
                <div className="profile-header-box">
                  <div className="cover-photo" style={{backgroundImage: `url(${userInfo.coverPic})`}}>
                     <label className="upload-btn cover-upload">📷 কভার পরিবর্তন<input type="file" hidden onChange={(e)=>handleImageUpload(e, 'coverPic')}/></label>
                  </div>
                  <div className="avatar-section">
                    <div className="avatar" style={{backgroundImage: `url(${userInfo.profilePic})`}}>
                      <label className="upload-btn avatar-upload">📷<input type="file" hidden onChange={(e)=>handleImageUpload(e, 'profilePic')}/></label>
                    </div>
                    <div className="user-titles">
                      <h3>{userInfo.name || (user.isAnonymous ? 'গেস্ট ইউজার' : 'আপনার নাম দিন')}</h3>
                      <p>{user.email || 'No Email'}</p>
                    </div>
                  </div>
                </div>

                {/* Profile Form (Same as Delivery Form) */}
                <div className="profile-edit-card mt-20">
                  <h3 className="sub-title">আপনার তথ্য (এডিট করা যাবে)</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} />
                    <input type="number" placeholder="মোবাইল নম্বর" value={userInfo.phone} onChange={e => setUserInfo({...userInfo, phone: e.target.value})} />
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({...userInfo, district: e.target.value})} />
                      <input type="text" placeholder="থানা/উপজেলা" value={userInfo.area} onChange={e => setUserInfo({...userInfo, area: e.target.value})} />
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={userInfo.address} onChange={e => setUserInfo({...userInfo, address: e.target.value})}></textarea>
                    <button className="btn-primary mt-10" onClick={() => saveProfileData()}>তথ্য সেভ করুন</button>
                  </div>
                </div>

                {/* Order History */}
                <div className="order-history mt-20">
                  <h3 className="sub-title">আপনার অর্ডার সমূহ ({userOrders.length})</h3>
                  {userOrders.length === 0 ? <p className="text-muted">কোনো অর্ডার নেই।</p> : (
                    userOrders.map(o => (
                      <div key={o.id} className={`history-card ${getStatusColor(o.status)}`}>
                        <div className="hc-head">
                          <strong>Order #{o.id.slice(-5).toUpperCase()}</strong>
                          <span className="badge-status">{o.status}</span>
                        </div>
                        <p className="text-sm text-muted">{o.date}</p>
                        <p className="mt-10"><b>পণ্য:</b> {o.items?.map(i => `${i.name} (${i.qty})`).join(', ')}</p>
                        <p><b>মোট বিল:</b> ৳{toBanglaNum(o.total)}</p>
                      </div>
                    ))
                  )}
                </div>

                <button className="btn-danger w-100 mt-20" onClick={handleLogout}>লগ আউট করুন</button>
              </div>
            )}
          </div>
        )}

        {/* --- ABOUT US TAB --- */}
        {activeTab === 'about' && (
          <div className="about-view" style={{ padding: '30px 20px', textAlign: 'center', minHeight:'80vh', background:'#fff' }}>
            <h2 style={{ color: '#27ae60', marginBottom:'20px' }}>About Us</h2>
            <img src={headerImage} alt="Sakib Store" style={{width:'100px', height:'100px', borderRadius:'50%', marginBottom:'20px', objectFit:'cover'}}/>
            <p style={{lineHeight:'1.6', color:'#555', fontSize:'16px'}}>সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। আমরা সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            
            <div style={{ background:'#f9f9f9', padding:'20px', borderRadius:'10px', marginTop:'30px', border:'1px solid #eee' }}>
              <p style={{ fontWeight: 'bold', fontSize:'18px', color:'#333', marginBottom:'15px' }}>যোগাযোগ:</p>
              <p style={{margin:'5px 0'}}>📞 ০১৭২৪৪০৯২১৯</p>
              <p style={{margin:'5px 0'}}>📞 ০১৭৩৫৩৭৬০৭৯</p>
              <p style={{margin:'5px 0'}}>📞 ০১৭২৩৫৩৯৭৩৮</p>
            </div>
          </div>
        )}
      </main>

      {/* --- Bottom Navigation --- */}
      <footer className="bottom-nav">
        <div className={`nav-icon ${activeTab === 'home' ? 'active' : ''}`} onClick={() => changeTab('home')}>🏠<span>হোম</span></div>
        <div className={`nav-icon ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => changeTab('categories')}>🗂️<span>ক্যাটাগরি</span></div>
        <div className={`nav-icon ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => changeTab('cart')} style={{position:'relative'}}>
          🛒<span>কার্ট</span>
          {cart.length > 0 && <span style={{position:'absolute', top:'-5px', right:'-5px', background:'#e74c3c', color:'#fff', fontSize:'10px', width:'18px', height:'18px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold'}}>{toBanglaNum(cart.length)}</span>}
        </div>
        <div className={`nav-icon ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => changeTab('profile')}>👤<span>প্রোফাইল</span></div>
      </footer>

    </div>
  );
}

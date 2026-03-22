import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, getDoc, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import './App.css'; 

// --- ফায়ারবেস কনফিগারেশন ---
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
  if(!num && num !== 0) return '০';
  return Number(num).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
}; 

// --- নতুন ডেলিভারি চার্জ লজিক ---
const deliveryLocations = [
  "গোবিন্দল", "সিংগাইর বাজার", "নীলটেক", "পুকুরপাড়া", "ঘোনাপাড়া", "বকচর",
  "সিংগাইর উপজেলার ভেতরে", "নিজে লেখুন"
];

const getDeliveryCharge = (locationName) => {
  const twentyTakaAreas = ["গোবিন্দল", "সিংগাইর বাজার", "নীলটেক", "পুকুরপাড়া", "ঘোনাপাড়া", "বকচর"];
  if (twentyTakaAreas.includes(locationName)) return 20;
  if (locationName === "সিংগাইর উপজেলার ভেতরে") return 40;
  return 50; // নিজে লেখুন বা অন্য যেকোনো কিছু
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

// --- মূল অ্যাপ কম্পোনেন্ট ---
export default function App() {
  const CURRENT_VERSION_CODE = 106; 
  const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য']; 

  const [products, setProducts] = useState([]);
  const [headerImage, setHeaderImage] = useState('https://via.placeholder.com/800x300');
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম!');
  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' }); 

  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); 
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); 
  const [adminTab, setAdminTab] = useState('orders'); 
  const [adminOrderFilter, setAdminOrderFilter] = useState('All');

  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]); 
  const [userInfo, setUserInfo] = useState({ 
    name: '', phone: '', locationType: 'গোবিন্দল', district: '', area: '', address: '', paymentMethod: 'Cash on Delivery', senderNumber: '', transactionId: '',
    profilePic: '', coverPic: ''
  }); 

  // Auth States
  const [loginMethod, setLoginMethod] = useState('phone'); // phone, email, guest
  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Admin States
  const [adminPass, setAdminPass] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  const [editId, setEditId] = useState(null); 
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'সব পণ্য', stock: 100, unit: '১কেজি', synonyms: '' }); 

  // Double Back to Exit Logic
  const [backPressCount, setBackPressCount] = useState(0);

  useEffect(() => {
    fetchProducts();
    checkUpdate();
    fetchSettings();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const identifier = currentUser.phoneNumber ? currentUser.phoneNumber.replace("+88", "") : (currentUser.email || currentUser.uid);
        setUser({ id: identifier, isAnonymous: currentUser.isAnonymous });
        loadUserData(identifier);
      } else {
        setUser(null);
      }
    });

    // Handle Back Button
    window.history.pushState(null, null, window.location.pathname);
    const handlePopState = () => {
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        window.history.pushState(null, null, window.location.pathname);
      } else if (activeTab !== 'home') {
        setActiveTab('home');
        window.history.pushState(null, null, window.location.pathname);
      } else {
        setBackPressCount(prev => prev + 1);
        setTimeout(() => setBackPressCount(0), 2000);
        if (backPressCount === 1) {
          window.close(); // Note: window.close() might only work in PWA/Capacitor
        } else {
          window.history.pushState(null, null, window.location.pathname);
          alert('অ্যাপ থেকে বের হতে আরও একবার Back চাপুন');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeTab, isDrawerOpen, backPressCount]); 

  const fetchProducts = async () => {
    const snap = await getDocs(collection(db, "products"));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }; 

  const checkUpdate = async () => {
    const docSnap = await getDoc(doc(db, "Latest", "version_info"));
    if (docSnap.exists() && docSnap.data().versionCode > CURRENT_VERSION_CODE) {
      setUpdateInfo({ hasUpdate: true, url: docSnap.data().downloadUrl, version: docSnap.data().versionName });
    }
  }; 

  const fetchSettings = async () => {
    const noticeSnap = await getDoc(doc(db, "settings", "notice"));
    if (noticeSnap.exists()) setScrollingNotice(noticeSnap.data().text);
    const headerSnap = await getDoc(doc(db, "settings", "header"));
    if (headerSnap.exists()) setHeaderImage(headerSnap.data().url);
  }; 

  const loadUserData = async (identifier) => {
    const uSnap = await getDoc(doc(db, "users", identifier));
    if (uSnap.exists() && uSnap.data().info) {
      setUserInfo(prev => ({...prev, ...uSnap.data().info}));
    }
    const oSnap = await getDocs(query(collection(db, "orders"), where("userId", "==", identifier)));
    setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  }; 

  // --- Auth Logic ---
  const sendOtp = async () => {
    if (loginPhone.length !== 11) return alert("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন!");
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      }
      const formattedPhone = "+88" + loginPhone;
      const res = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      setConfirmResult(res);
      setOtpSent(true);
      alert("আপনার নম্বরে ওটিপি পাঠানো হয়েছে!");
    } catch (e) { 
      alert("সমস্যা: " + e.message + "\n(নোট: OTP এর জন্য ফায়ারবেসে বিলিং অন থাকতে হবে)"); 
      if(window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
    }
  }; 

  const verifyOtp = async () => {
    try {
      await confirmResult.confirm(otpCode);
      setOtpSent(false);
      alert("লগইন সফল!");
    } catch (e) { alert("ভুল ওটিপি কোড!"); }
  };

  const emailLogin = async (isSignUp) => {
    try {
      if(isSignUp) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      alert("লগইন সফল!");
    } catch (e) { alert("সমস্যা: " + e.message); }
  };

  const guestLogin = async () => {
    try {
      await signInAnonymously(auth);
      alert("গেস্ট হিসেবে লগইন সফল!");
    } catch (e) { alert("সমস্যা: " + e.message); }
  };

  const saveProfileData = async () => {
    if(user) {
      await setDoc(doc(db, "users", user.id), { info: userInfo }, { merge: true });
      alert('প্রোফাইল আপডেট হয়েছে!');
    }
  };

  // --- Cart Logic ---
  const handleCart = (product, action) => {
    if (action === 'add' && product.stock <= 0) {
       return alert("দুঃখিত, এই পণ্যটি স্টকে নেই!");
    }
    
    const { baseQty, step } = parseUnitStr(product.unit);
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id);
      if (action === 'add') {
        if (existing) {
          if((existing.qty + step) > (product.stock * baseQty)) return prevCart; // Prevent adding more than stock
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

  // --- Checkout Logic ---
  const submitOrder = async () => {
    if (!userInfo.name || !userInfo.phone || !userInfo.district || !userInfo.area || !userInfo.address) {
      return alert("দয়া করে ডেলিভারির জন্য সকল তথ্য দিন!");
    }
    if ((userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nagad') && (!userInfo.senderNumber || !userInfo.transactionId)) {
      return alert("বিকাশ/নগদ পেমেন্টের ক্ষেত্রে সেন্ডার নম্বর এবং TrxID দেওয়া বাধ্যতামূলক!");
    }
    
    const orderData = {
      items: cart, 
      userInfo, 
      userId: user?.id || userInfo.phone,
      paymentMethod: userInfo.paymentMethod, 
      total: finalTotal, 
      status: 'Pending', 
      date: new Date().toLocaleString(), 
      timestamp: Date.now()
    }; 

    try {
      await addDoc(collection(db, "orders"), orderData);
      
      // Update Stock count in Firebase
      cart.forEach(async (item) => {
        const { baseQty } = parseUnitStr(item.unit);
        const purchasedAmount = item.qty / baseQty;
        const newStock = Math.max(0, item.stock - purchasedAmount);
        await updateDoc(doc(db, "products", item.id), { stock: newStock });
      });

      if(user) {
        await setDoc(doc(db, "users", user.id), { info: userInfo }, { merge: true }); 
      }

      alert(`অর্ডার সফল! আপনার পেমেন্ট মেথড: ${userInfo.paymentMethod}`);
      setCart([]); 
      fetchProducts(); // Refresh stock
      setActiveTab('profile'); 
      if(user) loadUserData(user.id);
    } catch (e) {
      alert("অর্ডার সম্পন্ন করতে সমস্যা হয়েছে: " + e.message);
    }
  }; 

  // --- Admin Logic ---
  const fetchAllOrders = async () => {
    const snap = await getDocs(collection(db, "orders"));
    setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  }; 

  const saveProduct = async () => {
    if (!newP.name || !newP.price) return alert("দয়া করে পণ্যের নাম ও দাম দিন!");
    try {
      if (editId) {
        await updateDoc(doc(db, "products", editId), newP);
        alert("পণ্য সফলভাবে আপডেট হয়েছে!");
      } else {
        await addDoc(collection(db, "products"), newP);
        alert("নতুন পণ্য সফলভাবে যোগ হয়েছে!");
      }
      setEditId(null);
      setNewP({ name: '', price: '', image: '', category: 'সব পণ্য', stock: 100, unit: '১কেজি', synonyms: '' });
      fetchProducts();
    } catch (error) { alert("সমস্যা হয়েছে: " + error.message); }
  }; 

  const editProduct = (p) => {
    setEditId(p.id);
    setNewP({ name: p.name, price: p.price, image: p.image, category: p.category, stock: p.stock, unit: p.unit, synonyms: p.synonyms || '' });
    window.scrollTo(0, 0); 
  }; 

  // =========================================================================
  // ADMIN VIEW RENDER
  // =========================================================================
  if (viewMode === 'adminLogin') {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h2>🛡️ অ্যাডমিন লগইন</h2>
          <input type="password" placeholder="গোপন পাসওয়ার্ড দিন" value={adminPass} onChange={e => setAdminPass(e.target.value)} />
          <button className="primary-btn" onClick={() => { if(adminPass === 'sakib123') { setViewMode('admin'); fetchAllOrders(); setAdminPass(''); } else alert('ভুল পাসওয়ার্ড!'); }}>লগইন</button>
          <button className="cancel-btn" onClick={() => setViewMode('customer')}>ফিরে যান</button>
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

        <div className="admin-body">
          <div className="admin-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => {setAdminTab('orders'); fetchAllOrders();}} style={{ flex: 1, padding: '12px', background: adminTab === 'orders' ? '#27ae60' : '#ddd', color: adminTab === 'orders' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>📦 অর্ডারসমূহ</button>
            <button onClick={() => setAdminTab('stock')} style={{ flex: 1, padding: '12px', background: adminTab === 'stock' ? '#27ae60' : '#ddd', color: adminTab === 'stock' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>📊 স্টক ও সেটিংস</button>
          </div> 

          {adminTab === 'orders' ? (
            <div className="admin-orders-section">
              <h3 style={{borderBottom: '2px solid #27ae60', paddingBottom: '10px'}}>📦 অর্ডার ম্যানেজমেন্ট</h3>
              
              {/* Order Status Filters */}
              <div style={{display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '15px', paddingBottom: '5px'}}>
                {['All', 'Pending', 'Confirmed', 'On Delivery', 'Delivered', 'Cancelled'].map(s => (
                  <button key={s} onClick={() => setAdminOrderFilter(s)} style={{padding: '5px 15px', borderRadius: '20px', border: '1px solid #27ae60', background: adminOrderFilter === s ? '#27ae60' : '#fff', color: adminOrderFilter === s ? '#fff' : '#27ae60', whiteSpace: 'nowrap'}}>{s}</button>
                ))}
              </div>

              <div className="orders-list">
                {allOrders.filter(o => adminOrderFilter === 'All' || o.status === adminOrderFilter).map(order => (
                  <div key={order.id} className="admin-order-card" style={{border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', background: '#f9f9f9'}}>
                    <div className="order-info">
                      <strong>অর্ডার আইডি: #{order.id.slice(-5).toUpperCase()}</strong> <br/>
                      <span style={{fontSize:'12px', color:'#666'}}>{order.date}</span>
                      <p><b>গ্রাহক:</b> {order.userInfo.name} ({order.userInfo.phone})</p>
                      <p><b>ঠিকানা:</b> {order.userInfo.address}, {order.userInfo.area}, {order.userInfo.district}</p>
                      <p><b>পণ্য:</b> {order.items.map(i => `${i.name} (${i.qty}${parseUnitStr(i.unit).text})`).join(', ')}</p>
                      <p><b>পেমেন্ট:</b> <span style={{color: '#2980b9'}}>{order.paymentMethod}</span> | <b>মোট:</b> ৳{order.total}</p>
                      {(order.paymentMethod === 'Bkash' || order.paymentMethod === 'Nagad') && (
                        <p style={{color: '#d35400', background:'#fff3cd', padding:'5px'}}>TrxID: {order.userInfo.transactionId} | Sender: {order.userInfo.senderNumber}</p>
                      )}
                    </div> 
                    <div className="status-control" style={{marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center'}}>
                      <label>স্ট্যাটাস:</label>
                      <select className={`status-select ${getStatusColor(order.status)}`} value={order.status} onChange={async (e) => {
                          const newStatus = e.target.value;
                          await updateDoc(doc(db, "orders", order.id), { status: newStatus });
                          fetchAllOrders(); 
                        }} style={{padding: '5px', borderRadius: '5px', color:'#fff'}}>
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
            <div className="admin-stock-section">
              {/* Cover Photo Settings */}
              <div className="admin-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '20px', border: '2px solid #27ae60' }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#27ae60' }}>🖼️ হেডারের ছবি (ফেসবুক কভার সাইজ)</h4>
                <input type="text" placeholder="ছবির লিঙ্ক (URL) দিন..." value={headerImage} onChange={(e) => setHeaderImage(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px' }} />
                <button onClick={async () => { await setDoc(doc(db, "settings", "header"), { url: headerImage }, {merge:true}); alert("কভার আপডেট হয়েছে!"); }} className="primary-btn">সেভ করুন</button>
              </div> 

              {/* Notice Settings */}
              <div className="notice-edit-card" style={{ background: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '20px', border: '2px solid #f1c40f' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#f39c12' }}>📢 চলমান নোটিশ আপডেট</h4>
                <textarea placeholder="ঘোষণা লিখুন..." value={scrollingNotice} onChange={(e) => setScrollingNotice(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px' }} />
                <button onClick={async () => { await setDoc(doc(db, "settings", "notice"), { text: scrollingNotice }, {merge:true}); alert("ঘোষণা আপডেট হয়েছে!"); }} style={{ width: '100%', padding: '10px', background: '#f39c12', color: '#fff', border: 'none', borderRadius: '8px' }}>নোটিশ সেভ করুন</button>
              </div> 

              {/* Add/Edit Product */}
              <div className="form-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '25px' }}>
                <h3 style={{ color: '#27ae60', marginBottom: '15px' }}>{editId ? "✏️ পণ্য এডিট করুন" : "➕ নতুন পণ্য যোগ"}</h3>
                <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} /> 
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                  <input type="text" placeholder="পরিমাণ (যেমন: ১ কেজি, হালি, পিচ)" value={newP.unit} onChange={e => setNewP({...newP, unit: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                </div> 
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <select value={newP.category} onChange={e => setNewP({...newP, category: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}>
                    {categoriesList.filter(c => c !== 'সব পণ্য').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" placeholder="স্টক সংখ্যা" value={newP.stock} onChange={e => setNewP({...newP, stock: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                </div> 
                <input type="text" placeholder="ছবির লিংক" value={newP.image} onChange={e => setNewP({...newP, image: e.target.value})} style={{ width: '100%', marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} /> 
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={saveProduct} style={{ flex: 2, padding: '12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px' }}>{editId ? "আপডেট করুন" : "সেভ করুন"}</button>
                  {editId && <button onClick={() => { setEditId(null); setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১কেজি', synonyms: '' }); }} style={{ flex: 1, padding: '12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px' }}>বাতিল</button>}
                </div>
              </div> 

              <h4>স্টক লিস্ট</h4>
              <div className="stock-list">
                {products.map(p => (
                  <div key={p.id} className="stock-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #eee', padding: '10px 0' }}>
                    <img src={p.image || 'https://via.placeholder.com/50'} alt="" style={{ width: '45px', height: '45px', borderRadius: '5px', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <strong>{p.name}</strong>
                      <p style={{fontSize: '12px', margin: 0}}>৳{p.price} / {p.unit} | স্টক: {p.stock}</p>
                    </div>
                    <button onClick={() => editProduct(p)} style={{ border: 'none', background: '#f1c40f', color:'#fff', padding:'5px 10px', borderRadius:'5px', cursor: 'pointer' }}>Edit</button>
                    <button onClick={async () => { if(window.confirm("ডিলিট করবেন?")) { await deleteDoc(doc(db, "products", p.id)); fetchProducts(); } }} style={{ border: 'none', background: '#e74c3c', color:'#fff', padding:'5px 10px', borderRadius:'5px', cursor: 'pointer' }}>Del</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } 

  // =========================================================================
  // CUSTOMER VIEW RENDER
  // =========================================================================
  return (
    <div className="sakib-app">
      {/* Update Popup */}
      {updateInfo.hasUpdate && (
        <div className="modal-overlay">
          <div className="update-modal">
            <h3>নতুন আপডেট! 🚀</h3>
            <p>অ্যাপের নতুন ভার্সন পাওয়া যাচ্ছে।</p>
            <button className="primary-btn" onClick={() => window.open(updateInfo.url)}>এখনই আপডেট করুন</button>
          </div>
        </div>
      )} 

      {/* Header */}
      <header className="app-header" style={{ position: 'relative', width: '100%', height: '220px', overflow: 'hidden' }}>
        <img src={headerImage} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> 
        <button onClick={() => setIsDrawerOpen(true)} className="drawer-btn" style={{position:'absolute', top:'15px', left:'15px', background:'rgba(0,0,0,0.5)', color:'#fff', border:'none', fontSize:'24px', padding:'5px 10px', borderRadius:'5px'}}>☰</button> 
        <div className="cart-icon" onClick={() => setActiveTab('cart')} style={{position:'absolute', top:'15px', right:'15px', background:'rgba(255,255,255,0.9)', padding:'8px 15px', borderRadius:'20px', fontWeight:'bold', boxShadow:'0 2px 5px rgba(0,0,0,0.2)'}}>
          🛒 {cart.length > 0 && <span className="cart-badge" style={{color:'#e74c3c'}}>{cart.length} টি</span>}
        </div>
      </header> 

      {/* Notice Bar */}
      <div className="notice-bar" style={{background:'#27ae60', color:'#fff', padding:'5px 0'}}>
        <marquee direction="left" scrollamount="5">📢 {scrollingNotice}</marquee>
      </div> 

      {/* Sidebar Drawer */}
      {isDrawerOpen && <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)} style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', zIndex:99}}></div>}
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`} style={{position:'fixed', top:0, left: isDrawerOpen ? 0 : '-250px', width:'250px', height:'100%', background:'#fff', zIndex:100, transition:'0.3s', boxShadow:'2px 0 5px rgba(0,0,0,0.1)'}}>
        <div className="drawer-header" style={{background:'#27ae60', color:'#fff', padding:'20px', fontSize:'20px', fontWeight:'bold'}}>সাকিব স্টোর</div>
        <div className="drawer-links" style={{padding:'20px'}}>
          <p onClick={() => {setActiveTab('home'); setIsDrawerOpen(false)}} style={{padding:'10px 0', borderBottom:'1px solid #eee'}}>🏠 হোম</p>
          <p onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false)}} style={{padding:'10px 0', borderBottom:'1px solid #eee'}}>👤 প্রোফাইল</p>
          <p onClick={() => window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html', '_blank')} style={{padding:'10px 0', borderBottom:'1px solid #eee'}}>🚀 App Update</p> 
          <p onClick={() => {setActiveTab('about'); setIsDrawerOpen(false)}} style={{padding:'10px 0', borderBottom:'1px solid #eee'}}>ℹ️ About Us</p>
          <p className="admin-link" onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false)}} style={{padding:'10px 0', color:'#e74c3c', fontWeight:'bold'}}>🛡️ অ্যাডমিন পেনেল</p>
        </div>
      </div> 

      {/* Main Content Area */}
      <div className="main-content" style={{ paddingBottom: '70px' }}>
        
        {/* --- HOME TAB --- */}
        {activeTab === 'home' && (
          <>
            <div className="search-container" style={{padding:'15px', background:'#f9f9f9'}}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input type="text" placeholder="পণ্য সার্চ করুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{width:'100%', padding:'12px 40px 12px 15px', borderRadius:'25px', border:'1px solid #ccc', fontSize:'16px'}} />
                <span style={{position:'absolute', right:'15px', top:'12px', fontSize:'18px'}}>🔍</span>
              </div>
            </div> 

            {/* Horizontal Categories */}
            <div className="home-categories" style={{display:'flex', overflowX:'auto', padding:'10px 15px', gap:'10px', background:'#fff', borderBottom:'1px solid #eee'}}>
              {categoriesList.map(c => (
                <button key={c} onClick={() => {setSelectedCat(c); setActiveTab('categories');}} style={{padding:'8px 15px', border:'1px solid #27ae60', background: '#fff', color: '#27ae60', borderRadius:'20px', whiteSpace:'nowrap', fontWeight:'bold'}}>
                  {c}
                </button>
              ))}
            </div>

            {/* 3 Column Product Grid */}
            <div className="product-grid-3col" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', padding:'15px'}}>
              {products
                .filter(p => searchTerm === '' || p.name.toLowerCase().includes(searchTerm.toLowerCase().trim()))
                .map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price; 
                  const isOutOfStock = p.stock <= 0;

                  return (
                    <div key={p.id} className="p-card" style={{background:'#fff', borderRadius:'8px', padding:'8px', textAlign:'center', boxShadow:'0 2px 5px rgba(0,0,0,0.1)', display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
                      <img src={p.image} alt={p.name} style={{width:'100%', height:'80px', objectFit:'contain', marginBottom:'5px'}} />
                      <h4 style={{fontSize:'13px', margin:'5px 0', height:'35px', overflow:'hidden'}}>{p.name}</h4>
                      <p style={{color:'#e74c3c', fontWeight:'bold', fontSize:'14px', margin:0}}>৳{toBanglaNum(currentPrice)}</p>
                      <p style={{fontSize:'11px', color:'#7f8c8d', margin:'2px 0'}}>{p.unit}</p>
                      <p style={{fontSize:'10px', color: isOutOfStock ? '#e74c3c' : '#27ae60', marginBottom:'5px'}}>স্টক: {isOutOfStock ? 'শেষ' : toBanglaNum(p.stock)}</p>
                      
                      {cItem ? (
                        <div className="qty-control" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px', background: '#f0f0f0', borderRadius: '5px'}}>
                          <button onClick={() => handleCart(p, 'remove')} style={{width: '25px', height: '25px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '3px'}}>-</button>
                          <span style={{fontWeight: 'bold', fontSize: '12px'}}>{toBanglaNum(cItem.qty)}</span>
                          <button onClick={() => handleCart(p, 'add')} style={{width: '25px', height: '25px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '3px'}}>+</button>
                        </div>
                      ) : (
                        <button disabled={isOutOfStock} className="add-btn" onClick={() => handleCart(p, 'add')} style={{width:'100%', padding:'6px', background: isOutOfStock ? '#bdc3c7' : '#27ae60', color:'#fff', border:'none', borderRadius:'5px', fontSize:'12px'}}>
                          {isOutOfStock ? 'স্টক নেই' : 'যোগ করুন'}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )} 

        {/* --- CATEGORIES TAB (2 Columns) --- */}
        {activeTab === 'categories' && (
          <div className="cat-layout" style={{ display: 'flex', height: 'calc(100vh - 270px)', background: '#f9f9f9' }}>
            <div className="cat-sidebar" style={{ width: '100px', background: '#fff', borderRight: '1px solid #eee', overflowY: 'auto' }}>
              {categoriesList.map(c => (
                <div key={c} onClick={() => setSelectedCat(c)}
                  style={{ padding: '15px 10px', fontSize: '13px', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #eee', background: selectedCat === c ? '#e8f5e9' : 'transparent', color: selectedCat === c ? '#27ae60' : '#555', fontWeight: selectedCat === c ? 'bold' : 'normal', borderLeft: selectedCat === c ? '4px solid #27ae60' : 'none' }}>
                  {c}
                </div>
              ))}
            </div> 

            <div className="cat-products-view" style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '10px', borderBottom: '2px solid #27ae60', display: 'inline-block' }}>{selectedCat}</h3> 
              {/* 2 Column Grid */}
              <div className="cat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {products.filter(p => selectedCat === 'সব পণ্য' || p.category === selectedCat).map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price; 
                  const isOutOfStock = p.stock <= 0;

                  return (
                    <div key={p.id} className="cat-p-card" style={{ background: '#fff', borderRadius: '10px', padding: '10px', textAlign: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <img src={p.image} alt={p.name} style={{ width: '100%', height: '90px', objectFit: 'contain', marginBottom: '5px' }} />
                      <h5 style={{ margin: '5px 0', fontSize: '14px', height: '35px', overflow: 'hidden' }}>{p.name}</h5>
                      <p style={{ margin: '0', fontSize: '14px', color: '#e74c3c', fontWeight: 'bold' }}>৳{toBanglaNum(currentPrice)}</p>
                      <p style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>/{p.unit}</p> 
                      <p style={{fontSize:'10px', color: isOutOfStock ? '#e74c3c' : '#27ae60', marginBottom:'8px'}}>স্টক: {isOutOfStock ? 'শেষ' : toBanglaNum(p.stock)}</p>

                      {cItem ? (
                        <div className="qty-control-mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f0f0', borderRadius: '5px', padding: '3px' }}>
                          <button onClick={() => handleCart(p, 'remove')} style={{ border: 'none', background: '#e74c3c', color: '#fff', borderRadius: '3px', width: '30px', height:'25px' }}>-</button>
                          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{toBanglaNum(cItem.qty)}</span>
                          <button onClick={() => handleCart(p, 'add')} style={{ border: 'none', background: '#27ae60', color: '#fff', borderRadius: '3px', width: '30px', height:'25px' }}>+</button>
                        </div>
                      ) : (
                        <button disabled={isOutOfStock} onClick={() => handleCart(p, 'add')} style={{ width: '100%', padding: '8px', background: isOutOfStock ? '#bdc3c7' : '#27ae60', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '13px' }}>{isOutOfStock ? 'স্টক নেই' : 'যোগ করুন'}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )} 

        {/* --- CART TAB --- */}
        {activeTab === 'cart' && (
          <div className="cart-view" style={{ padding: '15px', background: '#fdfdfd', minHeight: '80vh' }}>
            <h3 style={{ textAlign: 'center', color: '#27ae60', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>🛒 আপনার কার্ট</h3>
            
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '50px', color: '#888' }}>
                <p>আপনার কার্ট খালি!</p>
                <button className="primary-btn" onClick={() => setActiveTab('home')}>বাজার করতে যান</button>
              </div>
            ) : (
              <>
                {cart.map(item => {
                  const { baseQty, text } = parseUnitStr(item.unit);
                  const itemTotalPrice = (item.price / baseQty) * item.qty;
                  return (
                    <div key={item.id} className="cart-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px', borderRadius: '10px', marginBottom: '10px', border: '1px solid #f0f0f0' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 'bold' }}>{item.name}</span>
                        <span style={{ fontSize: '12px', color: '#888', display: 'block' }}>{toBanglaNum(item.qty)} {text} x (৳{toBanglaNum(item.price)} / {item.unit})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="qty-control" style={{ display: 'flex', alignItems: 'center', background: '#f9f9f9', borderRadius: '20px', padding: '2px 8px' }}>
                          <button onClick={() => handleCart(item, 'remove')} style={{ border: 'none', background: 'none', color: '#e74c3c', fontSize:'18px' }}>-</button>
                          <span style={{ margin: '0 10px', fontWeight:'bold' }}>{toBanglaNum(item.qty)}</span>
                          <button onClick={() => handleCart(item, 'add')} style={{ border: 'none', background: 'none', color: '#27ae60', fontSize:'18px' }}>+</button>
                        </div>
                        <span style={{ fontWeight: 'bold', color:'#e74c3c' }}>৳{toBanglaNum(itemTotalPrice)}</span>
                      </div>
                    </div>
                  );
                })} 

                {/* Delivery Location Selection */}
                <div style={{marginTop:'15px'}}>
                  <label style={{fontWeight:'bold', color:'#555'}}>কোথায় ডেলিভারি নিবেন?</label>
                  <select value={userInfo.locationType} onChange={e => setUserInfo({...userInfo, locationType: e.target.value})} style={{width:'100%', padding:'12px', borderRadius:'8px', border:'1px solid #27ae60', marginTop:'5px', background:'#e8f5e9'}}>
                    {deliveryLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>

                <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '12px', marginTop: '15px', border: '1px solid #c8e6c9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><span>পণ্যের দাম:</span><span>৳{toBanglaNum(totalCartPrice)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#666' }}><span>ডেলিভারি চার্জ:</span><span>৳{toBanglaNum(deliveryCharge)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', borderTop: '1px dashed #ccc', paddingTop: '10px' }}><span>সর্বমোট বিল:</span><span style={{color:'#e74c3c'}}>৳{toBanglaNum(finalTotal)}</span></div>
                </div> 

                {/* Checkout Form */}
                <div className="checkout-form" style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ color: '#555', borderBottom:'1px solid #ddd', paddingBottom:'5px' }}>🚚 ডেলিভারি তথ্য (সবগুলো পূরণ করা আবশ্যক)</h4>
                  <input placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({ ...userInfo, name: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  <input placeholder="মোবাইল নম্বর" type="number" value={userInfo.phone} onChange={e => setUserInfo({ ...userInfo, phone: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({ ...userInfo, district: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                    <input placeholder="থানা/উপজেলা" value={userInfo.area} onChange={e => setUserInfo({ ...userInfo, area: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  </div>
                  <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={userInfo.address} onChange={e => setUserInfo({ ...userInfo, address: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', minHeight: '60px' }} /> 

                  <h4 style={{ color: '#555', marginTop: '10px', borderBottom:'1px solid #ddd', paddingBottom:'5px' }}>💳 পেমেন্ট পদ্ধতি</h4>
                  <select value={userInfo.paymentMethod} onChange={e => setUserInfo({ ...userInfo, paymentMethod: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff' }}>
                    <option value="Cash on Delivery">Cash on Delivery (নগদ টাকা)</option>
                    <option value="Bkash">বিকাশ (Bkash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                  </select> 

                  {(userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nagad') && (
                    <div style={{ background: '#fff9c4', padding: '15px', borderRadius: '10px', border: '1px dashed #f39c12' }}>
                      <p style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#856404', lineHeight: '1.4' }}>
                        👉 আমাদের <b>{userInfo.paymentMethod}</b> পার্সনাল নম্বর: <b>01723539738</b><br />
                        সর্বমোট <b>৳{toBanglaNum(finalTotal)}</b> টাকা "Send Money" করে নিচের বক্সে তথ্য দিন:
                      </p>
                      <input placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন" type="number" value={userInfo.senderNumber || ''} onChange={e => setUserInfo({...userInfo, senderNumber: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd', marginBottom: '8px' }} />
                      <input placeholder="Transaction ID (TrxID)" value={userInfo.transactionId || ''} onChange={e => setUserInfo({...userInfo, transactionId: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
                    </div>
                  )} 

                  <button className="primary-btn" onClick={submitOrder} style={{ background: '#e74c3c', padding: '16px', fontSize: '18px', marginTop: '15px', borderRadius:'10px' }}>
                    অর্ডার নিশ্চিত করুন (৳{toBanglaNum(finalTotal)})
                  </button> 
                </div>
              </>
            )}
          </div>
        )} 

        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
          <div className="profile-view" style={{ padding: '0', background:'#f5f6fa', minHeight:'80vh' }}>
            {!user ? (
              <div style={{padding:'20px'}}>
                <div className="login-box" style={{ background: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ textAlign: 'center', marginBottom: '20px', color:'#27ae60' }}>লগইন করুন</h3>
                  
                  {/* Login Tabs */}
                  <div style={{display:'flex', gap:'5px', marginBottom:'20px'}}>
                    <button onClick={()=>setLoginMethod('phone')} style={{flex:1, padding:'8px', borderRadius:'5px', border:'none', background: loginMethod==='phone'?'#27ae60':'#eee', color: loginMethod==='phone'?'#fff':'#333'}}>মোবাইল</button>
                    <button onClick={()=>setLoginMethod('email')} style={{flex:1, padding:'8px', borderRadius:'5px', border:'none', background: loginMethod==='email'?'#27ae60':'#eee', color: loginMethod==='email'?'#fff':'#333'}}>ইমেইল</button>
                    <button onClick={guestLogin} style={{flex:1, padding:'8px', borderRadius:'5px', border:'none', background: '#34495e', color: '#fff'}}>গেস্ট</button>
                  </div>

                  {loginMethod === 'phone' && (
                    <>
                      <div id="recaptcha-container"></div> 
                      <input placeholder="মোবাইল নম্বর (যেমন: 017...)" type="number" onChange={e => setLoginPhone(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px' }} />
                      {!otpSent ? (
                        <button onClick={sendOtp} className="primary-btn" style={{ width: '100%', background:'#27ae60' }}>OTP পাঠান</button>
                      ) : (
                        <>
                          <input placeholder="কোড দিন" type="number" onChange={e => setOtpCode(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px' }} />
                          <button onClick={verifyOtp} className="primary-btn" style={{ width: '100%', background:'#e74c3c' }}>ভেরিফাই</button>
                        </>
                      )}
                    </>
                  )}

                  {loginMethod === 'email' && (
                    <>
                      <input placeholder="ইমেইল অ্যাড্রেস" type="email" onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '8px' }} />
                      <input placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)" type="password" onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px' }} />
                      <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={()=>emailLogin(false)} className="primary-btn" style={{ flex: 1, background:'#27ae60' }}>লগইন</button>
                        <button onClick={()=>emailLogin(true)} className="primary-btn" style={{ flex: 1, background:'#2980b9' }}>রেজিস্ট্রেশন</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {/* Profile Cover & DP */}
                <div style={{position:'relative', height:'200px', background:'#ddd'}}>
                  <img src={userInfo.coverPic || 'https://via.placeholder.com/800x300'} alt="Cover" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                  <div style={{position:'absolute', bottom:'-40px', left:'50%', transform:'translateX(-50%)', width:'100px', height:'100px', borderRadius:'50%', border:'4px solid #fff', background:'#fff', overflow:'hidden'}}>
                    <img src={userInfo.profilePic || 'https://via.placeholder.com/100'} alt="DP" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                  </div>
                </div>

                <div style={{padding:'50px 20px 20px 20px'}}>
                  <h3 style={{textAlign:'center', margin:'0'}}>{userInfo.name || (user.isAnonymous ? 'গেস্ট ইউজার' : 'নতুন ইউজার')}</h3>
                  <p style={{ color: '#666', textAlign:'center', marginTop:'5px' }}>{user.id !== user.uid ? user.id : 'অ্যাকাউন্ট আইডি: ' + user.id.substring(0,8)}</p> 

                  {/* Profile Edit Section */}
                  <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '20px', marginTop:'20px' }}>
                    <h4 style={{borderBottom:'1px solid #eee', paddingBottom:'10px'}}>👤 আপনার তথ্য এডিট করুন (ডেলিভারিতে সুবিধা হবে)</h4>
                    <input placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} style={{ width: '100%', padding: '12px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '8px' }} />
                    <input placeholder="মোবাইল নম্বর" value={userInfo.phone} onChange={e => setUserInfo({...userInfo, phone: e.target.value})} style={{ width: '100%', padding: '12px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '8px' }} />
                    <div style={{display:'flex', gap:'10px'}}>
                      <input placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({...userInfo, district: e.target.value})} style={{ flex:1, padding: '12px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '8px' }} />
                      <input placeholder="থানা" value={userInfo.area} onChange={e => setUserInfo({...userInfo, area: e.target.value})} style={{ flex:1, padding: '12px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '8px' }} />
                    </div>
                    <textarea placeholder="বিস্তারিত ঠিকানা" value={userInfo.address} onChange={e => setUserInfo({...userInfo, address: e.target.value})} style={{ width: '100%', padding: '12px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '8px' }} />
                    <input placeholder="প্রোফাইল পিকচার URL (ঐচ্ছিক)" value={userInfo.profilePic} onChange={e => setUserInfo({...userInfo, profilePic: e.target.value})} style={{ width: '100%', padding: '12px', margin: '5px 0', border: '1px dashed #27ae60', borderRadius: '8px' }} />
                    <input placeholder="কভার পিকচার URL (ঐচ্ছিক)" value={userInfo.coverPic} onChange={e => setUserInfo({...userInfo, coverPic: e.target.value})} style={{ width: '100%', padding: '12px', margin: '5px 0', border: '1px dashed #2980b9', borderRadius: '8px' }} />
                    <button className="primary-btn" onClick={saveProfileData} style={{ marginTop: '15px', width:'100%', background:'#2980b9' }}>তথ্য সেভ করুন</button>
                  </div> 

                  {/* Order History */}
                  <h4 style={{ borderBottom: '2px solid #27ae60', display: 'inline-block', marginBottom: '15px' }}>আপনার অর্ডার লিস্ট:</h4>
                  {userOrders && userOrders.length > 0 ? (
                    userOrders.map(o => (
                      <div key={o.id} style={{ background:'#fff', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #eee', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
                        <div style={{display:'flex', justifyContent:'space-between', borderBottom:'1px dashed #ddd', paddingBottom:'10px', marginBottom:'10px'}}>
                           <strong>#{o.id.slice(-5).toUpperCase()}</strong>
                           <span className={getStatusColor(o.status)} style={{padding:'3px 10px', borderRadius:'15px', fontSize:'12px', color:'#fff', fontWeight:'bold'}}>{o.status}</span>
                        </div>
                        <p style={{fontSize:'12px', color:'#888', margin:'0 0 5px 0'}}>তারিখ: {o.date}</p>
                        <p style={{margin:'0 0 5px 0'}}><b>পণ্য:</b> {o.items.map(i=>i.name).join(', ')}</p>
                        <p style={{margin:'0', fontWeight:'bold', color:'#e74c3c'}}>মোট: ৳{toBanglaNum(o.total)}</p>
                      </div>
                    ))
                  ) : (
                    <div style={{textAlign:'center', padding:'30px', background:'#fff', borderRadius:'10px'}}>
                      <p style={{color:'#888'}}>এখনো কোনো অর্ডার করেননি।</p>
                    </div>
                  )}
                  <button onClick={() => {signOut(auth); setUserInfo({name:'', phone:'', district:'', area:'', address:'', profilePic:'', coverPic:''})}} className="cancel-btn" style={{ width: '100%', marginTop: '30px', background:'#e74c3c', color:'#fff', padding:'12px', borderRadius:'8px', border:'none' }}>লগআউট</button>
                </div>
              </div>
            )}
          </div>
        )} 

        {/* --- ABOUT US TAB --- */}
        {activeTab === 'about' && (
          <div className="about-view" style={{ padding: '30px 20px', textAlign: 'center', minHeight:'80vh', background:'#fff' }}>
            <h2 style={{ color: '#27ae60', marginBottom:'20px' }}>About Us</h2>
            <img src={headerImage} alt="Sakib Store" style={{width:'100px', height:'100px', borderRadius:'50%', marginBottom:'20px'}}/>
            <p style={{lineHeight:'1.6', color:'#555', fontSize:'16px'}}>সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। আমরা সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            
            <div style={{ background:'#f9f9f9', padding:'20px', borderRadius:'10px', marginTop:'30px', border:'1px solid #eee' }}>
              <p style={{ fontWeight: 'bold', fontSize:'18px', color:'#333', marginBottom:'15px' }}>যোগাযোগ:</p>
              <p style={{margin:'5px 0'}}>📞 ০১৭২৪৪০৯২১৯</p>
              <p style={{margin:'5px 0'}}>📞 ০১৭৩৫৩৭৬০৭৯</p>
              <p style={{margin:'5px 0'}}>📞 ০১৭২৩৫৩৯৭৩৮</p>
            </div>
          </div>
        )}
      </div> 

      {/* --- Bottom Navigation --- */}
      <footer className="bottom-nav">
        <div className={`nav-icon ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>🏠<span>হোম</span></div>
        <div className={`nav-icon ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>🗂️<span>ক্যাটাগরি</span></div>
        <div className={`nav-icon ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => setActiveTab('cart')} style={{position:'relative'}}>
          🛒<span>কার্ট</span>
          {cart.length > 0 && <span style={{position:'absolute', top:'-5px', right:'15px', background:'#e74c3c', color:'#fff', fontSize:'10px', width:'18px', height:'18px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center'}}>{cart.length}</span>}
        </div>
        <div className={`nav-icon ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>👤<span>প্রোফাইল</span></div>
      </footer>
    </div>
  );
}

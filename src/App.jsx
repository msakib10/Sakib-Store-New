import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, getDoc, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "firebase/auth";
import './App.css';

// --- ফায়ারবেস কনফিগারেশন ---
const firebaseConfig = {
  apiKey: "AIzaSyBSKT8knhfyLHSuz-Z8nnj3jrYn2KBcP0M",
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

// ডেলিভারি চার্জ লজিক
const getDeliveryCharge = (area, district) => {
  const specialAreas = ['গোবিন্দল', 'সিংগাইর বাজার', 'পুকুরপাড়া', 'বকচর', 'নীলটেক'];
  if (specialAreas.some(a => area && area.includes(a))) return 20;
  if (district && district.includes('সিংগাইর')) return 30;
  return 50; // ডিফল্ট চার্জ
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
  // App States
  const CURRENT_VERSION_CODE = 105; 
  const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];

  // Data States
  const [products, setProducts] = useState([]);
  const [headerImage, setHeaderImage] = useState('https://via.placeholder.com/800x300');
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম!');
  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' });

  // UI States
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); // 'customer', 'adminLogin', 'admin'
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); 
  const [adminTab, setAdminTab] = useState('orders');

  // User & Cart States
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]); 
  const [userInfo, setUserInfo] = useState({ 
    name: '', phone: '', district: '', area: '', address: '', paymentMethod: 'Cash on Delivery', senderNumber: '', transactionId: ''
  });

  // Auth States
  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  // Admin States
  const [adminPass, setAdminPass] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  const [editId, setEditId] = useState(null); 
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১কেজি', synonyms: '' });

  // --- Effects ---
  useEffect(() => {
    fetchProducts();
    checkUpdate();
    fetchSettings();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const phone = currentUser.phoneNumber.replace("+88", "");
        setUser({ phone });
        loadUserData(phone);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

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

  const loadUserData = async (phone) => {
    const uSnap = await getDoc(doc(db, "users", phone));
    if (uSnap.exists() && uSnap.data().info) {
      setUserInfo(prev => ({...prev, ...uSnap.data().info}));
    }
    const oSnap = await getDocs(query(collection(db, "orders"), where("userPhone", "==", phone)));
    setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  };

  // --- OTP Logic ---
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
  };

  const sendOtp = async () => {
    if (loginPhone.length !== 11) return alert("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন!");
    try {
      setupRecaptcha();
      const formattedPhone = "+88" + loginPhone;
      const res = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      setConfirmResult(res);
      setOtpSent(true);
      alert("আপনার নম্বরে ওটিপি পাঠানো হয়েছে!");
    } catch (e) { 
      alert("সমস্যা: " + e.message); 
      if(window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
    }
  };

  const verifyOtp = async () => {
    try {
      const result = await confirmResult.confirm(otpCode);
      const phone = result.user.phoneNumber.replace("+88", "");
      setUser({ phone });
      loadUserData(phone);
      setOtpSent(false);
      alert("লগইন সফল!");
    } catch (e) { alert("ভুল ওটিপি কোড!"); }
  };

  // --- Cart Logic ---
  const handleCart = (product, action) => {
    const { baseQty, step } = parseUnitStr(product.unit);
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id);
      if (action === 'add') {
        if (existing) return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty + step } : item);
        return [...prevCart, { ...product, qty: baseQty }];
      } 
      if (action === 'remove' && existing) {
        if (existing.qty > baseQty) return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty - step } : item);
        return prevCart.filter(item => item.id !== product.id);
      }
      return prevCart;
    });
  };

  // Dynamic calculations for Cart
  const totalCartPrice = cart.reduce((acc, item) => {
    const { baseQty } = parseUnitStr(item.unit);
    return acc + (item.price / baseQty) * item.qty;
  }, 0);
  const deliveryCharge = cart.length > 0 ? getDeliveryCharge(userInfo.area, userInfo.district) : 0;
  const finalTotal = totalCartPrice + deliveryCharge;

  // --- Checkout Logic ---
  const submitOrder = async () => {
    if (!userInfo.name || !userInfo.phone || !userInfo.district || !userInfo.area || !userInfo.address) {
      return alert("দয়া করে ডেলিভারির জন্য সকল তথ্য (নাম, ফোন, জেলা, থানা, ঠিকানা) দিন!");
    }
    if ((userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nagad') && (!userInfo.senderNumber || !userInfo.transactionId)) {
      return alert("বিকাশ/নগদ পেমেন্টের ক্ষেত্রে সেন্ডার নম্বর এবং TrxID দেওয়া বাধ্যতামূলক!");
    }
    
    const orderData = {
      items: cart, 
      userInfo, 
      userPhone: user?.phone || userInfo.phone,
      paymentMethod: userInfo.paymentMethod, 
      total: finalTotal, 
      status: 'Pending', 
      date: new Date().toLocaleString(), 
      timestamp: Date.now()
    }; 

    try {
      await addDoc(collection(db, "orders"), orderData);
      
      // Save user info for future
      const phoneToSave = user?.phone || userInfo.phone;
      await setDoc(doc(db, "users", phoneToSave), { info: userInfo }, { merge: true }); 

      alert(`অর্ডার সফল! আপনার পেমেন্ট মেথড: ${userInfo.paymentMethod}`);
      setCart([]); 
      setActiveTab('profile'); 
      if(user) loadUserData(user.phone);
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
          <input type="password" placeholder="পাসওয়ার্ড দিন" value={adminPass} onChange={e => setAdminPass(e.target.value)} />
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
              <div className="orders-list">
                {allOrders.map(order => (
                  <div key={order.id} className="admin-order-card" style={{border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', background: '#f9f9f9'}}>
                    <div className="order-info">
                      <strong>অর্ডার আইডি: #{order.id.slice(-5).toUpperCase()}</strong>
                      <p>গ্রাহক: {order.userInfo.name} ({order.userPhone})</p>
                      <p>ঠিকানা: {order.userInfo.address}, {order.userInfo.area}, {order.userInfo.district}</p>
                      <p>পণ্য: {order.items.map(i => `${i.name} (${i.qty}${parseUnitStr(i.unit).text})`).join(', ')}</p>
                      <p>পেমেন্ট: <b>{order.paymentMethod}</b> | মোট: ৳{order.total}</p>
                      {(order.paymentMethod === 'Bkash' || order.paymentMethod === 'Nagad') && (
                        <p style={{color: '#d35400'}}>TrxID: {order.userInfo.transactionId} | Sender: {order.userInfo.senderNumber}</p>
                      )}
                    </div> 
                    <div className="status-control" style={{marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center'}}>
                      <label>স্ট্যাটাস:</label>
                      <select className={`status-select ${getStatusColor(order.status)}`} value={order.status} onChange={async (e) => {
                          const newStatus = e.target.value;
                          await updateDoc(doc(db, "orders", order.id), { status: newStatus });
                          fetchAllOrders(); 
                        }} style={{padding: '5px', borderRadius: '5px'}}>
                        <option value="Pending">Pending ⏳</option>
                        <option value="Confirmed">Confirmed ✅</option>
                        <option value="On Delivery">On Delivery 🚚</option>
                        <option value="Delivered">Delivered 🏁</option>
                        <option value="Cancelled">Cancelled ❌</option>
                      </select>
                      <button className="d-btn" style={{background: '#ff4d4d', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px'}} onClick={async () => { if(window.confirm("অর্ডারটি ডিলিট করবেন?")) { await deleteDoc(doc(db, "orders", order.id)); fetchAllOrders(); } }}>❌</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : ( 
            <div className="admin-stock-section">
              {/* Cover Photo Settings */}
              <div className="admin-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '20px', border: '2px solid #27ae60' }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#27ae60' }}>🖼️ কভার ফটো আপডেট</h4>
                <input type="text" placeholder="ছবির লিঙ্ক (URL) দিন..." value={headerImage} onChange={(e) => setHeaderImage(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px' }} />
                <button onClick={async () => { await setDoc(doc(db, "settings", "header"), { url: headerImage }, {merge:true}); alert("কভার আপডেট হয়েছে!"); }} className="primary-btn">সেভ করুন</button>
              </div> 

              {/* Notice Settings */}
              <div className="notice-edit-card" style={{ background: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '20px', border: '2px solid #f1c40f' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#f39c12' }}>📢 নোটিশ আপডেট</h4>
                <textarea placeholder="ঘোষণা লিখুন..." value={scrollingNotice} onChange={(e) => setScrollingNotice(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px' }} />
                <button onClick={async () => { await setDoc(doc(db, "settings", "notice"), { text: scrollingNotice }, {merge:true}); alert("ঘোষণা আপডেট হয়েছে!"); }} style={{ width: '100%', padding: '10px', background: '#f39c12', color: '#fff', border: 'none', borderRadius: '8px' }}>নোটিশ সেভ করুন</button>
              </div>

              {/* Add/Edit Product */}
              <div className="form-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '25px' }}>
                <h3 style={{ color: '#27ae60', marginBottom: '15px' }}>{editId ? "✏️ পণ্য এডিট করুন" : "➕ নতুন পণ্য যোগ"}</h3>
                <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} /> 
                <input type="text" placeholder="ভিন্ন নাম (synonyms)" value={newP.synonyms || ''} onChange={e => setNewP({...newP, synonyms: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} /> 
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                  <input type="text" placeholder="ইউনিট (যেমন: ১কেজি)" value={newP.unit} onChange={e => setNewP({...newP, unit: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                </div> 
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <select value={newP.category} onChange={e => setNewP({...newP, category: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}>
                    {categoriesList.filter(c => c !== 'সব পণ্য').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" placeholder="স্টক" value={newP.stock} onChange={e => setNewP({...newP, stock: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
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
                      <p style={{fontSize: '12px', margin: 0}}>৳{p.price} / {p.unit}</p>
                    </div>
                    <button onClick={() => editProduct(p)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✏️</button>
                    <button onClick={async () => { if(window.confirm("ডিলিট করবেন?")) { await deleteDoc(doc(db, "products", p.id)); fetchProducts(); } }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>❌</button>
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
            <p>অ্যাপের নতুন ভার্সন {updateInfo.version} পাওয়া যাচ্ছে।</p>
            <button className="primary-btn" onClick={() => window.open(updateInfo.url)}>এখনই আপডেট করুন</button>
          </div>
        </div>
      )} 

      {/* Header */}
      <header className="app-header" style={{ position: 'relative', width: '100%', height: '200px', overflow: 'hidden' }}>
        <img src={headerImage} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> 
        <button onClick={() => setIsDrawerOpen(true)} className="drawer-btn">☰</button> 
        <div className="cart-icon" onClick={() => setActiveTab('cart')}>
          🛒 {cart.length > 0 && <span className="cart-badge">{cart.length}</span>}
        </div>
      </header> 

      {/* Notice Bar */}
      <div className="notice-bar">
        <marquee direction="left" scrollamount="5">📢 {scrollingNotice} 📢</marquee>
      </div>

      {/* Sidebar Drawer */}
      {isDrawerOpen && <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}></div>}
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">সাকিব স্টোর</div>
        <div className="drawer-links">
          <p onClick={() => {setActiveTab('home'); setIsDrawerOpen(false)}}>🏠 হোম</p>
          <p onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false)}}>👤 প্রোফাইল</p>
          <p onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false)}}>🛒 কার্ট</p>
          <p onClick={() => window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html', '_blank')}>🚀 App Update</p> 
          <p onClick={() => {setActiveTab('about'); setIsDrawerOpen(false)}}>ℹ️ About Us</p>
          <p className="admin-link" onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false)}}>🛡️ অ্যাডমিন</p>
        </div>
      </div>

      {/* Main Content Area based on Tabs */}
      <div className="main-content" style={{ paddingBottom: '70px' }}>
        
        {/* --- HOME TAB --- */}
        {activeTab === 'home' && (
          <>
            <div className="search-container">
              <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
                <input type="text" placeholder="চাল, ডাল, তেল বা rice সার্চ করুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input-field" />
                <span className="search-icon">🔍</span>
              </div>
            </div> 

            <div className="product-grid">
              {products
                .filter(p => {
                  const searchLower = searchTerm.toLowerCase().trim();
                  const nameMatch = p.name.toLowerCase().includes(searchLower);
                  const synonymsMatch = p.synonyms && p.synonyms.toLowerCase().includes(searchLower);
                  return searchTerm === '' || nameMatch || synonymsMatch;
                })
                .sort((a, b) => {
                  if (searchTerm === '') return 0;
                  const searchLower = searchTerm.toLowerCase();
                  const aExact = a.name.toLowerCase().includes(searchLower);
                  const bExact = b.name.toLowerCase().includes(searchLower);
                  if (aExact && !bExact) return -1;
                  if (!aExact && bExact) return 1;
                  return 0;
                })
                .map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty, text } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price; 

                  return (
                    <div key={p.id} className="p-card">
                      <img src={p.image} alt={p.name} />
                      <h4>{p.name}</h4>
                      <p>৳{toBanglaNum(p.price)}/{p.unit}</p>
                      {cItem ? (
                        <div className="qty-control" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f8fdf8', border: '1px solid #27ae60', borderRadius: '8px'}}>
                          <button onClick={() => handleCart(p, 'remove')} style={{width: '32px', height: '32px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '18px'}}>-</button>
                          <div style={{textAlign: 'center', lineHeight: '1.2'}}>
                            <span style={{fontWeight: 'bold', color: '#27ae60', fontSize: '14px'}}>{toBanglaNum(cItem.qty)} {text}</span><br/>
                            <span style={{fontSize: '12px', color: '#e74c3c', fontWeight: 'bold'}}>৳{toBanglaNum(currentPrice)}</span>
                          </div>
                          <button onClick={() => handleCart(p, 'add')} style={{width: '32px', height: '32px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '18px'}}>+</button>
                        </div>
                      ) : (
                        <button className="add-btn" onClick={() => handleCart(p, 'add')}>যোগ করুন</button>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {/* --- CATEGORIES TAB --- */}
        {activeTab === 'categories' && (
          <div className="cat-layout" style={{ display: 'flex', height: 'calc(100vh - 200px)', background: '#f9f9f9' }}>
            <div className="cat-sidebar" style={{ width: '100px', background: '#fff', borderRight: '1px solid #eee', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {categoriesList.map(c => (
                <div key={c} className={`side-cat ${selectedCat === c ? 'active' : ''}`} onClick={() => setSelectedCat(c)}
                  style={{ padding: '15px 10px', fontSize: '13px', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', background: selectedCat === c ? '#e8f5e9' : 'transparent', color: selectedCat === c ? '#27ae60' : '#555', fontWeight: selectedCat === c ? 'bold' : 'normal', borderLeft: selectedCat === c ? '4px solid #27ae60' : 'none' }}>
                  {c}
                </div>
              ))}
            </div> 

            <div className="cat-products-view" style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#333', borderBottom: '2px solid #27ae60', display: 'inline-block' }}>{selectedCat}</h3> 
              <div className="cat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {products.filter(p => selectedCat === 'সব পণ্য' || p.category === selectedCat).map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty, text } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price; 
                  return (
                    <div key={p.id} className="cat-p-card" style={{ background: '#fff', borderRadius: '10px', padding: '10px', textAlign: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <img src={p.image} alt={p.name} style={{ width: '100%', height: '80px', objectFit: 'contain', marginBottom: '5px' }} />
                      <h5 style={{ margin: '5px 0', fontSize: '13px', height: '32px', overflow: 'hidden' }}>{p.name}</h5>
                      <p style={{ margin: '0', fontSize: '12px', color: '#e74c3c', fontWeight: 'bold' }}>৳{toBanglaNum(currentPrice)}</p>
                      <p style={{ fontSize: '10px', color: '#888', marginBottom: '8px' }}>/{p.unit}</p> 
                      {cItem ? (
                        <div className="qty-control-mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f0f0', borderRadius: '5px', padding: '2px' }}>
                          <button onClick={() => handleCart(p, 'remove')} style={{ border: 'none', background: '#e74c3c', color: '#fff', borderRadius: '3px', width: '25px' }}>-</button>
                          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{toBanglaNum(cItem.qty)}</span>
                          <button onClick={() => handleCart(p, 'add')} style={{ border: 'none', background: '#27ae60', color: '#fff', borderRadius: '3px', width: '25px' }}>+</button>
                        </div>
                      ) : (
                        <button className="add-btn-cat" onClick={() => handleCart(p, 'add')} style={{ width: '100%', padding: '6px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '12px' }}>যোগ করুন</button>
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
            <h3 style={{ textAlign: 'center', color: '#27ae60', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>🛒 আপনার কার্ট ({cart.length})</h3>
            
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
                          <button onClick={() => handleCart(item, 'remove')} style={{ border: 'none', background: 'none', color: '#e74c3c' }}>-</button>
                          <span style={{ margin: '0 10px' }}>{toBanglaNum(item.qty)}</span>
                          <button onClick={() => handleCart(item, 'add')} style={{ border: 'none', background: 'none', color: '#27ae60' }}>+</button>
                        </div>
                        <span style={{ fontWeight: 'bold' }}>৳{toBanglaNum(itemTotalPrice)}</span>
                      </div>
                    </div>
                  );
                })} 

                <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '12px', marginTop: '20px', border: '1px solid #c8e6c9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><span>পণ্যের দাম:</span><span>৳{toBanglaNum(totalCartPrice)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#666' }}><span>ডেলিভারি চার্জ:</span><span>৳{toBanglaNum(deliveryCharge)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', borderTop: '1px dashed #ccc', paddingTop: '10px' }}><span>সর্বমোট বিল:</span><span>৳{toBanglaNum(finalTotal)}</span></div>
                </div>

                {/* Checkout Form */}
                <div className="checkout-form" style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ color: '#555' }}>🚚 ডেলিভারি তথ্য (সবগুলো পূরণ করা আবশ্যক)</h4>
                  <input placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({ ...userInfo, name: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  <input placeholder="মোবাইল নম্বর" type="number" value={userInfo.phone} onChange={e => setUserInfo({ ...userInfo, phone: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({ ...userInfo, district: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                    <input placeholder="থানা/উপজেলা" value={userInfo.area} onChange={e => setUserInfo({ ...userInfo, area: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  </div>
                  <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={userInfo.address} onChange={e => setUserInfo({ ...userInfo, address: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', minHeight: '60px' }} /> 

                  <h4 style={{ color: '#555', marginTop: '10px' }}>💳 পেমেন্ট পদ্ধতি</h4>
                  <select value={userInfo.paymentMethod} onChange={e => setUserInfo({ ...userInfo, paymentMethod: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff' }}>
                    <option value="Cash on Delivery">Cash on Delivery (নগদ টাকা)</option>
                    <option value="Bkash">বিকাশ (Bkash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                  </select> 

                  {(userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nagad') && (
                    <div style={{ background: '#fff9c4', padding: '15px', borderRadius: '10px', border: '1px dashed #f39c12' }}>
                      <p style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#856404', lineHeight: '1.4' }}>
                        👉 আমাদের <b>{userInfo.paymentMethod}</b> পার্সনাল নম্বর: <b>০১৭২৩৫৩৯৭৩৮</b><br />
                        সর্বমোট <b>৳{toBanglaNum(finalTotal)}</b> টাকা "Send Money" করে নিচের বক্সে তথ্য দিন:
                      </p>
                      <input placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন" type="number" value={userInfo.senderNumber || ''} onChange={e => setUserInfo({...userInfo, senderNumber: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd', marginBottom: '8px' }} />
                      <input placeholder="Transaction ID (TrxID)" value={userInfo.transactionId || ''} onChange={e => setUserInfo({...userInfo, transactionId: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }} />
                    </div>
                  )} 

                  <button className="primary-btn" onClick={submitOrder} style={{ background: '#27ae60', padding: '16px', fontSize: '18px', marginTop: '15px' }}>
                    অর্ডার নিশ্চিত করুন (৳{toBanglaNum(finalTotal)})
                  </button> 
                </div>
              </>
            )}
          </div>
        )}

        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
          <div className="profile-view" style={{ padding: '20px' }}>
            {!user ? (
              <div className="login-box" style={{ background: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>লগইন করুন</h3>
                <div id="recaptcha-container"></div> 
                <input placeholder="মোবাইল নম্বর (যেমন: 017...)" type="number" onChange={e => setLoginPhone(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px' }} />
                {!otpSent ? (
                  <button onClick={sendOtp} className="primary-btn" style={{ width: '100%' }}>OTP পাঠান</button>
                ) : (
                  <>
                    <input placeholder="কোড দিন" type="number" onChange={e => setOtpCode(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px' }} />
                    <button onClick={verifyOtp} className="primary-btn" style={{ width: '100%' }}>ভেরিফাই</button>
                  </>
                )}
              </div>
            ) : (
              <div>
                <h3>স্বাগতম, {userInfo?.name || 'ইউজার'}</h3>
                <p style={{ color: '#666', marginBottom: '20px' }}>{user.phone}</p>

                <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                  <h4>আপনার সেভ করা তথ্য:</h4>
                  <input placeholder="নাম" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} style={{ width: '100%', padding: '10px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '5px' }} />
                  <input placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({...userInfo, district: e.target.value})} style={{ width: '100%', padding: '10px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '5px' }} />
                  <input placeholder="থানা" value={userInfo.area} onChange={e => setUserInfo({...userInfo, area: e.target.value})} style={{ width: '100%', padding: '10px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '5px' }} />
                  <textarea placeholder="বিস্তারিত ঠিকানা" value={userInfo.address} onChange={e => setUserInfo({...userInfo, address: e.target.value})} style={{ width: '100%', padding: '10px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '5px' }} />
                  <button className="primary-btn" onClick={async () => { await setDoc(doc(db, "users", user.phone), { info: userInfo }, { merge: true }); alert('তথ্য সেভ হয়েছে!'); }} style={{ marginTop: '10px' }}>তথ্য আপডেট করুন</button>
                </div>

                <h4 style={{ borderBottom: '2px solid #27ae60', display: 'inline-block', marginBottom: '10px' }}>আপনার অর্ডার লিস্ট:</h4>
                {userOrders && userOrders.length > 0 ? (
                  userOrders.map(o => (
                    <div key={o.id} className={`order-status ${getStatusColor(o.status)}`} style={{ padding: '10px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #ddd' }}>
                       <strong>#{o.id.slice(-5).toUpperCase()}</strong> | {o.date} <br/>
                       স্ট্যাটাস: <b>{o.status}</b> | মোট: ৳{toBanglaNum(o.total)}
                    </div>
                  ))
                ) : (
                  <p>এখনো কোনো অর্ডার করেননি।</p>
                )}
                <button onClick={() => signOut(auth)} className="cancel-btn" style={{ width: '100%', marginTop: '20px' }}>লগআউট</button>
              </div>
            )}
          </div>
        )}

        {/* --- ABOUT US TAB --- */}
        {activeTab === 'about' && (
          <div className="about-view" style={{ padding: '20px', textAlign: 'center' }}>
            <h3 style={{ color: '#27ae60' }}>About Us</h3>
            <p>সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। আমরা সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            <p style={{ fontWeight: 'bold', marginTop: '20px' }}>যোগাযোগ:</p>
            <p>০১৭২৪৪০৯২১৯</p>
            <p>০১৭৩৫৩৭৬০৭৯</p>
            <p>০১৭২৩৫৩৯৭৩৮</p>
          </div>
        )}
      </div>

      {/* --- Bottom Navigation --- */}
      <footer className="bottom-nav">
        <div className={`nav-icon ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>🏠<span>হোম</span></div>
        <div className={`nav-icon ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>🗂️<span>ক্যাটাগরি</span></div>
        <div className={`nav-icon ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => setActiveTab('cart')}>🛒<span>কার্ট</span></div>
        <div className={`nav-icon ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>👤<span>প্রোফাইল</span></div>
      </footer>
    </div>
  );
}

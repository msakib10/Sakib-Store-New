import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, getDoc, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "firebase/auth";
import './App.css';
// ফায়ারবেস কনফিগারেশন
const firebaseConfig = {
  apiKey: "AIzaSyBSKT8knhfyLHSuz-Z8nnj3jrYn2KBcP0M",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b"
};

import React, { useState, useEffect } from 'react';
// অন্য সব ইমপোর্ট...

// --- ধাপ ১: হেল্পার ফাংশনগুলো এখানে বসান ---
const parseUnitStr = (unitStr) => {
  if (!unitStr) return { baseQty: 1, text: 'টি', step: 1 };
  const engStr = String(unitStr).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  const match = engStr.match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    const num = parseFloat(match[1]);
    const txt = match[2] ? match[2].trim() : 'টি';
    let stepAmount = 1;
    // গ্রাম/মিলি হলে ১০/৫০ করে বাড়বে, বাকি সব ১ করে
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

// এরপর আপনার মূল ফাংশন শুরু হবে
export default function App() { 

  const [headerImage, setHeaderImage] = useState('https://via.placeholder.com/800x300'); // ডিফল্ট কভার ফটো
  const [adminPass, setAdminPass] = useState('');
  const [editId, setEditId] = useState(null);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const CURRENT_VERSION_CODE = 105; 
const DELIVERY_CHARGE = 50;
const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];
const unitList = ['কেজি', 'লিটার', 'পিস', 'হালি', 'ডজন', 'গ্রাম', 'প্যাকেট'];

const getDeliveryCharge = (area, district) => {
  // আপনার নির্দিষ্ট এলাকার তালিকা
  const specialAreas = ['গোবিন্দল', 'সিংগাইর বাজার', 'পুকুরপাড়া', 'বকচর', 'নীলটেক'];
  
  // যদি এলাকাটি তালিকার মধ্যে থাকে তবে ২০ টাকা
  if (specialAreas.some(a => area && area.includes(a))) {
    return 20;
  }
  
  // যদি এলাকা সিংগাইর উপজেলার ভেতরে হয় তবে ৩০ টাকা
  if (district && district.includes('সিংগাইর')) {
    return 30;
  }

  // এর বাইরে অন্য যেকোনো জায়গার জন্য (ডিফল্ট চার্জ)
  return 100; // আপনি চাইলে এটি কমাতে বা বাড়াতে পারেন
};


function App() {
  const [products, setProducts] = useState([]);
const handleCart = (product, action) => {
  const { baseQty, step } = parseUnitStr(product.unit);
  
  setCart(prevCart => {
    const existing = prevCart.find(item => item.id === product.id);
    
    if (action === 'add') {
      if (existing) {
        // আগে থেকে থাকলে শুধু পরিমাণ বাড়বে (যেমন ২কেজি থেকে ৩কেজি)
        return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty + step } : item);
      } else {
        // প্রথমবার কার্টে যোগ করলে বেস পরিমাণ অনুযায়ী যোগ হবে (যেমন ২কেজি)
        return [...prevCart, { ...product, qty: baseQty }];
      }
    } 
    
    if (action === 'remove') {
      if (existing.qty > baseQty) {
        // কমালে পরিমাণ কমবে, কিন্তু প্রথম পরিমাণের নিচে যাবে না
        return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty - step } : item);
      } else {
        // বেস পরিমাণের সমান থাকলে ডিলিট হয়ে যাবে
        return prevCart.filter(item => item.id !== product.id);
      }
    }
    return prevCart;
  });
};

  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer');
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);

  const [userInfo, setUserInfo] = useState({ 
  name: '', 
  phone: '', 
  district: '', // জেলা
  area: '',     // থানা/উপজেলা
  address: '',  // গ্রাম/রোড/বাড়ি নং
  paymentMethod: 'Cash on Delivery' 
});

  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' });
  
  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);
  
  const [adminTab, setAdminTab] = useState('orders'); // ডিফল্টভাবে অর্ডার দেখাবে

const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম!'); // ডিফল্ট লেখা


  const [allOrders, setAllOrders] = useState([]);
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: 'কেজি' });

useEffect(() => {
    fetchProducts();
    checkUpdate();
    onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const phone = currentUser.phoneNumber.replace("+88", "");
        setUser({ phone });
        loadUserData(phone);
      }
    });
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

const fetchNotice = async () => {
  const docSnap = await getDoc(doc(db, "settings", "notice"));
  if (docSnap.exists()) setScrollingNotice(docSnap.data().text);
};

useEffect(() => {
  fetchNotice();
}, []);


const getStatusColor = (status) => {
  switch (status) {
    case 'Pending': return 'st-pending';      // হলুদ
    case 'Confirmed': return 'st-confirmed';  // নীল
    case 'On Delivery': return 'st-delivery'; // কমলা
    case 'Delivered': return 'st-delivered';   // সবুজ
    case 'Cancelled': return 'st-cancelled';   // লাল
    default: return 'st-default';
  }
};


const loadUserData = async (phone) => {
    const uSnap = await getDoc(doc(db, "users", phone));
    if (uSnap.exists()) setUserInfo(uSnap.data().info || userInfo);
    const oSnap = await getDocs(query(collection(db, "orders"), where("userPhone", "==", phone)));
    setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  };

 // --- OTP Logic Fixed ---
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

// Cart (+/-) Logic
  const handleCart = (p, type) => {
    const exist = cart.find(x => x.id === p.id);
    if (type === 'add') {
      if (exist) setCart(cart.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x));
      else setCart([...cart, { ...p, qty: 1 }]);
    } else if (type === 'remove' && exist) {
      if (exist.qty === 1) setCart(cart.filter(x => x.id !== p.id));
      else setCart(cart.map(x => x.id === p.id ? { ...x, qty: x.qty - 1 } : x));
    }
  };

// Checkout Logic আপডেট
const submitOrder = async () => {
  if (!userInfo.name || !userInfo.phone || !userInfo.area) return alert("দয়া করে নাম, ফোন ও ঠিকানা দিন!");
  
  const total = cart.reduce((a,c) => a + (c.price * c.qty), 0) + DELIVERY_CHARGE;
  
  const orderData = {
    items: cart, 
    userInfo, 
    userPhone: user?.phone || userInfo.phone,
    paymentMethod: userInfo.paymentMethod, // পেমেন্ট মেথড সেভ হবে
    total, 
    status: 'Pending', 
    date: new Date().toLocaleString(), 
    timestamp: Date.now()
  };

  await addDoc(collection(db, "orders"), orderData);
  
// কাস্টমারের ডাটা সেভ করে রাখা হচ্ছে যাতে পরে লগইন করলে সব তথ্য পায়
    if (user) await setDoc(doc(db, "users", user.phone), { info: userInfo }, { merge: true });
    else await setDoc(doc(db, "users", userInfo.phone), { info: userInfo }, { merge: true });

  alert(`অর্ডার সফল! আপনার পেমেন্ট মেথড: ${userInfo.paymentMethod}`);
  setCart([]); 
  setActiveTab('profile'); 
  if(user) loadUserData(user.phone);
};

  // ড্রয়ার থেকে অ্যাডমিন প্যানেল খোলার ফাংশন
  const openAdmin = () => {
    setViewMode('adminLogin');
    setIsDrawerOpen(false);
  };

  // অ্যাডমিন প্যানেলে সব অর্ডার লোড করার ফাংশন
  const fetchAllOrders = async () => {
    const snap = await getDocs(collection(db, "orders"));
    setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  };

  // অ্যাডমিন প্যানেলে নতুন পণ্য সেভ বা আপডেট করার ফাংশন
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
      setNewP({ name: '', price: '', image: '', category: 'সব পণ্য', stock: 100, unit: 'কেজি', synonyms: '' });
      fetchProducts();
    } catch (error) {
      alert("সমস্যা হয়েছে: " + error.message);
    }
  };

  // অ্যাডমিন প্যানেলে কোনো পণ্য এডিট বাটনে ক্লিক করার ফাংশন
  const editProduct = (p) => {
    setEditId(p.id);
    setNewP({ name: p.name, price: p.price, image: p.image, category: p.category, stock: p.stock, unit: p.unit, synonyms: p.synonyms || '' });
    window.scrollTo(0, 0); // এডিট করার সময় পেজের উপরে নিয়ে যাবে
  };

// --- CUSTOMER VIEW ---
  return (
    <div className="sakib-app">
      {/* Auto Update Popup */}
      {updateInfo.hasUpdate && (
        <div className="modal-overlay">
          <div className="update-modal">
            <h3>নতুন আপডেট! 🚀</h3>
            <p>অ্যাপের নতুন ভার্সন {updateInfo.version} পাওয়া যাচ্ছে।</p>
            <button className="primary-btn" onClick={() => window.open(updateInfo.url)}>এখনই আপডেট করুন</button>
          </div>
        </div>
      )}

<header className="app-header" style={{ 
  position: 'relative', 
  width: '100%', 
  height: '200px', // আপনি চাইলে উচ্চতা বাড়াতে বা কমাতে পারেন
  overflow: 'hidden'
}}>
  {/* কভার ফটো */}
  <img 
    src={headerImage} 
    alt="Cover" 
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'cover' // ছবিকে কভারের মতো ফিট করবে
    }} 
  />

  {/* ড্রয়ার বাটন (উপরে বামে) */}
  <button 
    onClick={() => setIsDrawerOpen(true)} 
    style={{ 
      position: 'absolute', 
      top: '15px', 
      left: '15px', 
      background: 'rgba(0,0,0,0.3)', // হালকা কালো ছায়া যাতে সাদা ছবির ওপর দেখা যায়
      border: 'none', 
      color: '#fff', 
      fontSize: '24px',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}
  >
    ☰
  </button>

  {/* কার্ট আইকন (উপরে ডানে) */}
  <div 
    className="cart-icon" 
    onClick={() => setActiveTab('cart')} 
    style={{
      position: 'absolute',
      top: '15px',
      right: '15px',
      background: 'rgba(0,0,0,0.3)',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: '#fff'
    }}
  >
    🛒 {cart.length > 0 && (
      <span style={{
        position: 'absolute',
        top: '-5px',
        right: '-5px',
        background: '#ff4d4d',
        color: '#fff',
        fontSize: '12px',
        padding: '2px 6px',
        borderRadius: '50%',
        fontWeight: 'bold'
      }}>
        {cart.length}
      </span>
    )}
  </div>
</header>

{/* অ্যানিমেটেড নোটিশ লাইন */}
<div className="notice-bar" style={{
  background: '#fff9c4', // হালকা হলুদ ব্যাকগ্রাউন্ড
  color: '#333',
  padding: '8px 0',
  fontSize: '14px',
  fontWeight: '600',
  borderBottom: '1px solid #eee',
  overflow: 'hidden',
  whiteSpace: 'nowrap'
}}>
  <marquee direction="left" scrollamount="5">
    📢 {scrollingNotice} 📢
  </marquee>
</div>



{isDrawerOpen && <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}></div>}
<div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
  <div className="drawer-header">সাকিব স্টোর</div>
  <div className="drawer-links">
    <p onClick={() => {setActiveTab('home'); setIsDrawerOpen(false)}}>🏠 হোম</p>
    <p onClick={() => {setActiveTab('categories'); setIsDrawerOpen(false)}}>🗂️ ক্যাটাগরি</p>
    <p onClick={() => {setActiveTab('about'); setIsDrawerOpen(false)}}>ℹ️ About Us</p>
    
    {/* নতুন অ্যাপ আপডেট বাটন */}
    <p onClick={() => window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html', '_blank')}>
      🚀 App Update
    </p>

    <p className="admin-link" onClick={openAdmin}>🛡️ অ্যাডমিন</p>
  </div>
</div>


  // --- ADMIN VIEW ---
  if (viewMode === 'adminLogin') {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h2>🛡️ অ্যাডমিন লগইন</h2>
          <input type="password" placeholder="পাসওয়ার্ড দিন" value={adminPass} onChange={e => setAdminPass(e.target.value)} />
          <button onClick={() => { if(adminPass === 'sakib123') { setViewMode('admin'); setAdminPass(''); } else alert('ভুল পাসওয়ার্ড!'); }}>লগইন</button>
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
          {/* ট্যাব সুইচ করার বাটন */}
          <div className="admin-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button 
              onClick={() => setAdminTab('orders')} 
              style={{ flex: 1, padding: '12px', background: adminTab === 'orders' ? '#27ae60' : '#ddd', color: adminTab === 'orders' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
            >
              📦 অর্ডারসমূহ
            </button>
            <button 
              onClick={() => setAdminTab('stock')} 
              style={{ flex: 1, padding: '12px', background: adminTab === 'stock' ? '#27ae60' : '#ddd', color: adminTab === 'stock' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
            >
              📊 স্টক ম্যানেজমেন্ট
            </button>
          </div>


          {/* ১. অর্ডার ম্যানেজমেন্ট ট্যাব */}
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
                      <p>পণ্য: {order.items.map(i => `${i.name} (${i.qty})`).join(', ')}</p>
                      <p>পেমেন্ট: <b>{order.paymentMethod}</b> | মোট: ৳{order.total}</p>
                    </div>

                    <div className="status-control" style={{marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center'}}>
                      <label>স্ট্যাটাস:</label>
                      <select 
                        className={`status-select ${getStatusColor(order.status)}`} 
                        value={order.status} 
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          await updateDoc(doc(db, "orders", order.id), { status: newStatus });
                          fetchAllOrders(); 
                          alert(`অর্ডার স্ট্যাটাস ${newStatus} এ আপডেট হয়েছে!`);
                        }}
                        style={{padding: '5px', borderRadius: '5px'}}
                      >
                        <option value="Pending">Pending ⏳</option>
                        <option value="Confirmed">Confirmed ✅</option>
                        <option value="Processing">Processing ⚙️</option>
                        <option value="On Delivery">On Delivery 🚚</option>
                        <option value="Delivered">Delivered 🏁</option>
                        <option value="Cancelled">Cancelled ❌</option>
                      </select>
                      <button className="d-btn" style={{background: '#ff4d4d', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px'}} onClick={async () => { if(window.confirm("অর্ডারটি ডিলিট করবেন?")) { await deleteDoc(doc(db, "orders", order.id)); fetchAllOrders(); } }}>❌ ডিলিট</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (

{adminTab === 'stock' && (
  <div className="admin-card" style={{ 
    background: '#fff', 
    padding: '20px', 
    borderRadius: '12px', 
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)', 
    marginBottom: '20px',
    border: '2px solid #27ae60' 
  }}>
    <h4 style={{ margin: '0 0 15px 0', color: '#27ae60', display: 'flex', alignItems: 'center', gap: '10px' }}>
      🖼️ কভার ফটো আপডেট করুন
    </h4>
    <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>ফেসবুক কভারের মতো খালি ব্যানার ইমেজ লিঙ্ক এখানে দিন</p>
    <input 
      type="text" 
      placeholder="ছবির লিঙ্ক (URL) এখানে দিন..." 
      value={headerImage} 
      onChange={(e) => setHeaderImage(e.target.value)} 
      style={{ 
        width: '100%', 
        padding: '12px', 
        borderRadius: '8px', 
        border: '1px solid #ddd', 
        marginBottom: '10px',
        fontSize: '14px'
      }} 
    />
    <button 
      onClick={async () => {
        try {
          await setDoc(doc(db, "settings", "header"), { url: headerImage });
          alert("কভার ফটো সফলভাবে পরিবর্তন হয়েছে!");
        } catch (error) {
          alert("সেভ করতে সমস্যা হয়েছে!");
        }
      }}
      style={{ 
        width: '100%', 
        padding: '12px', 
        background: '#27ae60', 
        color: '#fff', 
        border: 'none', 
        borderRadius: '8px', 
        fontWeight: 'bold',
        cursor: 'pointer'
      }}
    >
      কভার ফটো সেভ করুন
    </button>
  </div>
)}

{/* নোটিশ পরিবর্তনের অংশ */}
<div className="notice-edit-card" style={{ 
  background: '#fff', 
  padding: '15px', 
  borderRadius: '12px', 
  boxShadow: '0 4px 10px rgba(0,0,0,0.1)', 
  marginBottom: '20px',
  border: '2px solid #f1c40f' 
}}>
  <h4 style={{ margin: '0 0 10px 0', color: '#f39c12' }}>📢 জরুরি ঘোষণা আপডেট</h4>
  <textarea 
    placeholder="এখানে আপনার ঘোষণাটি লিখুন..." 
    value={scrollingNotice} 
    onChange={(e) => setScrollingNotice(e.target.value)} 
    style={{ 
      width: '100%', 
      padding: '10px', 
      borderRadius: '8px', 
      border: '1px solid #ddd', 
      marginBottom: '10px',
      fontFamily: 'inherit'
    }} 
  />
  <button 
    onClick={async () => {
      await setDoc(doc(db, "settings", "notice"), { text: scrollingNotice });
      alert("ঘোষণা আপডেট হয়েছে!");
    }}
    style={{ 
      width: '100%', 
      padding: '10px', 
      background: '#f39c12', 
      color: '#fff', 
      border: 'none', 
      borderRadius: '8px', 
      fontWeight: 'bold' 
    }}
  >
    ঘোষণা সেভ করুন
  </button>
</div>


            /* ২. স্টক ম্যানেজমেন্ট ট্যাব */
            <div className="admin-stock-section">
              <div className="form-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '25px' }}>
  <h3 style={{ color: '#27ae60', marginBottom: '15px' }}>{editId ? "✏️ পণ্য এডিট করুন" : "➕ নতুন পণ্য যোগ করুন"}</h3>
  
  {/* পণ্যের নাম */}
  <input type="text" placeholder="পণ্যের নাম (যেমন: মিনিকেট চাল)" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />

  {/* নতুন: পণ্যের ভিন্ন নাম বা Synonyms (সার্চের জন্য) */}
  <input 
    type="text" 
    placeholder="ভিন্ন নাম (যেমন: rice, চাউল, চাউল) কমা দিয়ে লিখুন" 
    value={newP.synonyms || ''} 
    onChange={e => setNewP({...newP, synonyms: e.target.value})} 
    style={{ width: '100%', marginBottom: '10px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', background: '#fdfdfd' }} 
  />

  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
    {/* পণ্যের দাম */}
    <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
    
    {/* পরিবর্তন: ড্রপডাউনের বদলে টেক্সট ইনপুট (যাতে ১কেজি, ৫০০গ্রাম যা খুশি লেখা যায়) */}
    <input 
      type="text" 
      placeholder="ইউনিট (যেমন: ১কেজি বা ৫পিস)" 
      value={newP.unit} 
      onChange={e => setNewP({...newP, unit: e.target.value})} 
      style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} 
    />
  </div>

  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
    {/* ক্যাটাগরি সিলেক্ট */}
    <select value={newP.category} onChange={e => setNewP({...newP, category: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px', background: '#fff' }}>
      <option value="সব পণ্য">সব পণ্য</option>
      <option value="পাইকারি">পাইকারি</option>
      <option value="চাল">চাল</option>
      <option value="ডাল">ডাল</option>
      <option value="তেল">তেল</option>
      <option value="মসলা">মসলা</option>
      <option value="পানীয়">পানীয়</option>
      <option value="অন্যান্য">অন্যান্য</option>
    </select>
    
    <input type="number" placeholder="স্টক পরিমাণ" value={newP.stock} onChange={e => setNewP({...newP, stock: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
  </div>

  <input type="text" placeholder="ছবির লিংক (URL)" value={newP.image} onChange={e => setNewP({...newP, image: e.target.value})} style={{ width: '100%', marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />

  <div style={{ display: 'flex', gap: '10px' }}>
    <button onClick={saveProduct} style={{ flex: 2, padding: '12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>{editId ? "আপডেট করুন" : "সেভ করুন"}</button>
    {editId && <button onClick={() => { setEditId(null); setNewP({ name: '', price: '', image: '', category: 'সব পণ্য', stock: 10, unit: '১কেজি', synonyms: '' }); }} style={{ flex: 1, padding: '12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>বাতিল</button>}
  </div>
</div>
>

              <h4>স্টক লিস্ট</h4>
              <div className="stock-list">
                {products.map(p => (
                  <div key={p.id} className="stock-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #eee', padding: '10px 0' }}>
                    <img src={p.image || 'https://via.placeholder.com/50'} alt="" style={{ width: '45px', height: '45px', borderRadius: '5px', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <strong>{p.name}</strong>
                      <p style={{fontSize: '12px', margin: 0}}>৳{p.price} / {p.unit || 'কেজি'} | {p.category}</p>
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



{/* --- উন্নত ও বুদ্ধিমান সার্চ বার (ছবির ডিজাইন অনুযায়ী) --- */}
<div className="search-container" style={{
  display: 'flex',
  justify-content: 'center',
  padding: '15px 10px',
  background: '#f4f4f4', // হেডারের নিচের হালকা ব্যাকগ্রাউন্ড
  borderBottom: '1px solid #ddd'
}}>
  <div style={{
    position: 'relative',
    width: '100%',
    maxWidth: '500px' // বড় স্ক্রিনের জন্য লিমিট
  }}>
    <input 
      type="text" 
      placeholder="চাল, ডাল, তেল বা rice সার্চ করুন..." 
      value={searchTerm} // এখানে কি টাইপ করছেন তা স্পষ্ট দেখা যাবে
      onChange={e => setSearchTerm(e.target.value)} 
      style={{
        width: '100%',
        padding: '12px 15px 12px 40px', // বামে আইকনের জন্য জায়গা
        border: '1px solid #ccc',
        borderRadius: '25px', // ছবিতে দেখানো গোল আকৃতি
        fontSize: '15px',
        color: '#333',
        background: '#fff',
        boxShadow: '0 2px 5px rgba(0,0,0,0.05)', // হালকা ছায়া
        outline: 'none', // ক্লিক করলে কালো বর্ডার আসবে না
        transition: 'all 0.3s ease'
      }}
      className="search-input-field"
    />
    
    {/* সার্চ আইকন (ডানে বা বামে আপনার পছন্দ অনুযায়ী রাখতে পারেন) */}
    <span style={{
      position: 'absolute',
      left: '15px',
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: '18px',
      color: '#888',
      pointerEvents: 'none' // আইকনে ক্লিক লাগবে না
    }}>
      🔍 
    </span>
  </div>
</div>

{/* --- পণ্যের গ্রিড (ফিল্টারিং লজিক আপডেট সহ) --- */}
<div className="product-grid">
  {products
    .filter(p => {
      // ১. ক্যাটাগরি ফিল্টার
      const catMatch = (selectedCat === 'সব পণ্য' || p.category === selectedCat);
      
      // ২. বুদ্ধিমান সার্চ ফিল্টার (নাম + synonyms)
      const searchLower = searchTerm.toLowerCase().trim(); // সার্চ লেখা ছোট হাতের এবং ফাকা জায়গা মুক্ত করা
      const nameMatch = p.name.toLowerCase().includes(searchLower);
      const synonymsMatch = p.synonyms && p.synonyms.toLowerCase().includes(searchLower);
      
      // সার্চ খালি থাকলে সব দেখাবে, না হলে নাম বা ভিন্ন নামের সাথে মিললে দেখাবে
      return catMatch && (searchTerm === '' || nameMatch || synonymsMatch);
    })
    // ৩. সিরিয়াল করার লজিক: হুবহু নামের মিল আগে, ভিন্ন নামের মিল পরে
    .sort((a, b) => {
      if (searchTerm === '') return 0; // সার্চ না থাকলে সিরিয়াল পরিবর্তনের দরকার নেই
      
      const searchLower = searchTerm.toLowerCase();
      const aExact = a.name.toLowerCase().includes(searchLower);
      const bExact = b.name.toLowerCase().includes(searchLower);
      
      if (aExact && !bExact) return -1; // 'a' হুবহু মিললে আগে আসবে
      if (!aExact && bExact) return 1;  // 'b' হুবহু মিললে আগে আসবে
      return 0; // দুটোই কাছাকাছি মিল হলে আগের সিরিয়াল থাকবে
    })
    .map(p => {
      // পণ্য দেখানোর কার্ড লজিক (আগের মতোই থাকবে)
      const cItem = cart.find(x => x.id === p.id);
      return (
        <div key={p.id} className="p-card">
          <img src={p.image} alt={p.name} />
          <h4>{p.name}</h4>
          <p>৳{p.price}/{p.unit}</p>
          {/* বাটন লজিক */}
        </div>
      );
    })
  }
</div>


<div className="product-grid">
  {/* এখানে আপনার আগের ফিল্টার লজিকগুলো ঠিক রাখবেন */}
  {products.filter(p => p.name.includes(searchTerm)).map(p => {
    const cItem = cart.find(x => x.id === p.id);
    const { baseQty, text } = parseUnitStr(p.unit);
    
    // লাইভ প্রাইস হিসাব: (১০০ / ২) * বর্তমান পরিমাণ
    const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price;

    return (
      <div key={p.id} className="p-card">
        <img src={p.image} alt={p.name} />
        <h4>{p.name}</h4>
        <p>৳{toBanglaNum(p.price)}/{p.unit}</p>
        
        {cItem ? (
          <div className="qty-control" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f8fdf8', border: '1px solid #27ae60', borderRadius: '8px'}}>
            <button onClick={() => handleCart(p, 'remove')} style={{width: '32px', height: '32px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '18px', cursor: 'pointer'}}>-</button>
            
            <div style={{textAlign: 'center', lineHeight: '1.2'}}>
              {/* আপডেট হওয়া পরিমাণ (যেমন ৩ কেজি) */}
              <span style={{fontWeight: 'bold', color: '#27ae60', fontSize: '14px'}}>{toBanglaNum(cItem.qty)} {text}</span>
              <br/>
              {/* আপডেট হওয়া দাম (যেমন ১৫০ টাকা) */}
              <span style={{fontSize: '12px', color: '#e74c3c', fontWeight: 'bold'}}>৳{toBanglaNum(currentPrice)}</span>
            </div>
            
            <button onClick={() => handleCart(p, 'add')} style={{width: '32px', height: '32px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '18px', cursor: 'pointer'}}>+</button>
          </div>
        ) : (
          <button className="add-btn" onClick={() => handleCart(p, 'add')}>যোগ করুন</button>
        )}
      </div>
    );
  })}
</div>


{/* --- Category Tab: Vertical Sidebar & Dual Column Grid --- */}
{activeTab === 'categories' && (
  <div className="cat-layout" style={{ 
    display: 'flex', 
    height: 'calc(100vh - 120px)', // হেডার ও ফুটার বাদ দিয়ে বাকি জায়গা
    background: '#f9f9f9' 
  }}>
    
    {/* ১. বাম পাশের ক্যাটাগরি সাইডবার (স্থির থাকবে) */}
    <div className="cat-sidebar" style={{ 
      width: '100px', 
      background: '#fff', 
      borderRight: '1px solid #eee', 
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {['সব পণ্য', ...categoriesList].map(c => (
        <div 
          key={c} 
          className={`side-cat ${selectedCat === c ? 'active' : ''}`} 
          onClick={() => setSelectedCat(c)}
          style={{
            padding: '15px 10px',
            fontSize: '13px',
            textAlign: 'center',
            cursor: 'pointer',
            borderBottom: '1px solid #f5f5f5',
            background: selectedCat === c ? '#e8f5e9' : 'transparent',
            color: selectedCat === c ? '#27ae60' : '#555',
            fontWeight: selectedCat === c ? 'bold' : 'normal',
            borderLeft: selectedCat === c ? '4px solid #27ae60' : 'none'
          }}
        >
          {c}
        </div>
      ))}
    </div>

    {/* ২. ডান পাশের পণ্য প্রদর্শনী (উপর-নিচে স্ক্রল হবে) */}
    <div className="cat-products-view" style={{ 
      flex: 1, 
      padding: '10px', 
      overflowY: 'auto' 
    }}>
      <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#333', borderBottom: '2px solid #27ae60', display: 'inline-block' }}>
        {selectedCat}
      </h3>

      {/* দুই কলামের গ্রিড */}
      <div className="cat-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '10px' 
      }}>
        {products
          .filter(p => selectedCat === 'সব পণ্য' || p.category === selectedCat)
          .map(p => {
            const cItem = cart.find(x => x.id === p.id);
            const { baseQty, text } = parseUnitStr(p.unit);
            const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price;

            return (
              <div key={p.id} className="cat-p-card" style={{
                background: '#fff',
                borderRadius: '10px',
                padding: '10px',
                textAlign: 'center',
                boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-betw


import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, getDoc, setDoc, query, where } from "firebase/firestore";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "firebase/auth";
import './App.css';

// আপনার ফায়ারবেস কনফিগারেশন
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

const CURRENT_VERSION_CODE = 105; // আপনার অ্যাপের বর্তমান ভার্সন
const DELIVERY_CHARGE = 50;
const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer');
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // User & Order State
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [userInfo, setUserInfo] = useState({ name: '', phone: '', area: '', fullAddress: '' });
  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' });

  // OTP Login State
  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  // Admin State
  const [allOrders, setAllOrders] = useState([]);

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

  const loadUserData = async (phone) => {
    const uSnap = await getDoc(doc(db, "users", phone));
    if (uSnap.exists()) setUserInfo(uSnap.data().info || userInfo);
    const oSnap = await getDocs(query(collection(db, "orders"), where("userPhone", "==", phone)));
    setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  };

  // OTP Logic
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
  };

  const sendOtp = async () => {
    if (loginPhone.length !== 11) return alert("সঠিক ১১ ডিজিটের নম্বর দিন!");
    try {
      setupRecaptcha();
      const res = await signInWithPhoneNumber(auth, "+88" + loginPhone, window.recaptchaVerifier);
      setConfirmResult(res);
      setOtpSent(true);
      alert("আপনার ফোনে OTP পাঠানো হয়েছে!");
    } catch (e) { alert("Error: " + e.message); }
  };

  const verifyOtp = async () => {
    try {
      await confirmResult.confirm(otpCode);
      setOtpSent(false);
    } catch (e) { alert("ভুল কোড! আবার চেষ্টা করুন।"); }
  };

  // Cart Logic
  const handleCart = (p, type) => {
    const exist = cart.find(x => x.id === p.id);
    if (type === 'add') {
      if (exist) setCart(cart.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x));
      else setCart([...cart, { ...p, qty: 1 }]);
    } else {
      if (exist.qty === 1) setCart(cart.filter(x => x.id !== p.id));
      else setCart(cart.map(x => x.id === p.id ? { ...x, qty: x.qty - 1 } : x));
    }
  };

  const submitOrder = async () => {
    if (!userInfo.name || !userInfo.phone || !userInfo.area) return alert("দয়া করে নাম, নম্বর ও ঠিকানা দিন!");
    const total = cart.reduce((a,c) => a + (c.price * c.qty), 0) + DELIVERY_CHARGE;
    const orderData = {
      items: cart, userInfo, userPhone: user?.phone || userInfo.phone,
      total, status: 'Pending', date: new Date().toLocaleString(), timestamp: Date.now()
    };
    await addDoc(collection(db, "orders"), orderData);
    if (user) await setDoc(doc(db, "users", user.phone), { info: userInfo }, { merge: true });
    alert("আপনার অর্ডারটি সফলভাবে সম্পন্ন হয়েছে!");
    setCart([]); setActiveTab('profile'); loadUserData(user?.phone);
  };

  // Admin View Load
  const openAdmin = async () => {
    const pass = prompt("অ্যাডমিন পাসওয়ার্ড দিন:");
    if (pass === 'sakib123') { // পাসওয়ার্ড sakib123
      setViewMode('admin');
      setIsDrawerOpen(false);
      const oSnap = await getDocs(collection(db, "orders"));
      setAllOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
    } else alert("ভুল পাসওয়ার্ড!");
  };

  if (viewMode === 'admin') {
    return (
      <div className="admin-page">
        <header className="app-header">
          <button className="back-btn" onClick={() => setViewMode('customer')}>⬅</button>
          <h2 className="logo">Admin Panel</h2>
        </header>
        <div className="admin-orders">
          {allOrders.map(o => (
            <div key={o.id} className="admin-o-card">
              <p><b>আইডি:</b> #{o.id.slice(-5)} | <b>টাকা:</b> ৳{o.total}</p>
              <p><b>নাম:</b> {o.userInfo.name} ({o.userPhone})</p>
              <p><b>পণ্য:</b> {o.items.map(i => `${i.name}(${i.qty})`).join(', ')}</p>
              <select defaultValue={o.status} onChange={async (e) => {
                await updateDoc(doc(db, "orders", o.id), { status: e.target.value });
                alert("স্ট্যাটাস আপডেট করা হয়েছে!");
              }}>
                <option value="Pending">Pending 🟡</option>
                <option value="Confirmed">Confirmed 🔵</option>
                <option value="Delivered">Delivered 🟢</option>
                <option value="Cancelled">Cancelled 🔴</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sakib-app">
      {/* Auto Update Modal */}
      {updateInfo.hasUpdate && (
        <div className="update-modal-bg">
          <div className="update-modal">
            <h2>নতুন আপডেট! 🚀</h2>
            <p>নতুন ভার্সন {updateInfo.version} পাওয়া যাচ্ছে। নতুন ফিচারের জন্য এখনই আপডেট করুন।</p>
            <button onClick={() => window.open(updateInfo.url, '_blank')}>আপডেট করুন</button>
          </div>
        </div>
      )}

      {/* Header (১ম ৪ ছবির মতো) */}
      <header className="app-header">
        <button className="menu-btn" onClick={() => setIsDrawerOpen(true)}>☰</button>
        <h2 className="logo">SAKIB STORE</h2>
        <div className="cart-icon" onClick={() => setActiveTab('cart')}>🛒<span className="badge">{cart.length}</span></div>
      </header>

      {/* Side Menu */}
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-head"><h3>সাকিব স্টোর</h3></div>
        <div className="drawer-links">
          <p onClick={() => {setActiveTab('home'); setIsDrawerOpen(false)}}>🏠 হোম পেজ</p>
          <p onClick={() => {setActiveTab('categories'); setIsDrawerOpen(false)}}>🗂️ ক্যাটাগরি</p>
          <p onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false)}}>👤 প্রোফাইল</p>
          <p className="admin-link" onClick={openAdmin}>🛡️ অ্যাডমিন লগইন</p>
        </div>
      </div>

      <main className="main-content">
        {/* --- Home Tab --- */}
        {activeTab === 'home' && (
          <div className="home-page">
            <div className="search-bar"><input placeholder="পণ্য খুঁজুন..." onChange={e => setSearchTerm(e.target.value)} /></div>
            <div className="section-header">
              <h3>{selectedCat}</h3>
              <span onClick={() => setActiveTab('categories')} className="view-all">সব দেখুন</span>
            </div>
            <div className="product-grid">
              {products.filter(p => (selectedCat === 'সব পণ্য' || p.category === selectedCat) && p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                <div key={p.id} className="p-card">
                  <div className="img-box"><img src={p.image} alt={p.name} /></div>
                  <h4>{p.name}</h4>
                  <p className="price">৳{p.price}/{p.unit}</p>
                  <button className="add-btn" onClick={() => handleCart(p, 'add')}>কার্টে যোগ করুন</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Category Tab (১ম ৪ ছবির সুন্দর লিস্ট ভিউ) --- */}
        {activeTab === 'categories' && (
          <div className="category-page">
            <h3>সকল ক্যাটাগরি</h3>
            <div className="cat-list">
              {categoriesList.map(c => (
                <div key={c} className={`cat-list-item ${selectedCat === c ? 'active' : ''}`} onClick={() => {setSelectedCat(c); setActiveTab('home');}}>
                  <span>{c}</span>
                  <span className="arrow">➔</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Cart Tab --- */}
        {activeTab === 'cart' && (
          <div className="cart-page">
            <h3>🛒 শপিং কার্ট</h3>
            {cart.length === 0 ? <p className="empty-msg">কার্ট খালি!</p> : cart.map(item => (
              <div key={item.id} className="cart-item">
                <div>
                  <h4>{item.name}</h4>
                  <p>৳{item.price} x {item.qty}</p>
                </div>
                <div className="qty-controls">
                  <button onClick={() => handleCart(item, 'remove')}>-</button>
                  <span>{item.qty}</span>
                  <button onClick={() => handleCart(item, 'add')}>+</button>
                </div>
              </div>
            ))}
            {cart.length > 0 && (
              <div className="checkout-box">
                <h4>ডেলিভারি ঠিকানা</h4>
                <input placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} />
                <input placeholder="মোবাইল নম্বর" value={userInfo.phone} onChange={e => setUserInfo({...userInfo, phone: e.target.value})} />
                <textarea placeholder="বিস্তারিত ঠিকানা (এলাকা, গ্রাম, বাড়ি)" value={userInfo.area} onChange={e => setUserInfo({...userInfo, area: e.target.value})} />
                <div className="bill-summary">
                  <p>পণ্য: ৳{cart.reduce((a,c)=>a+(c.price*c.qty),0)}</p>
                  <p>ডেলিভারি: ৳{DELIVERY_CHARGE}</p>
                  <h3>মোট: ৳{cart.reduce((a,c)=>a+(c.price*c.qty),0)+DELIVERY_CHARGE}</h3>
                </div>
                <button className="confirm-btn" onClick={submitOrder}>অর্ডার কনফার্ম করুন</button>
              </div>
            )}
          </div>
        )}

        {/* --- Profile Tab --- */}
        {activeTab === 'profile' && (
          <div className="profile-page">
            {!user ? (
              <div className="login-container">
                <div className="login-card">
                  <h3>লগইন করুন</h3>
                  <div id="recaptcha-container"></div>
                  <input placeholder="মোবাইল নম্বর (017...)" onChange={e => setLoginPhone(e.target.value)} />
                  {!otpSent ? <button onClick={sendOtp}>OTP পাঠান</button> : (
                    <>
                      <input placeholder="৬ ডিজিট কোড" onChange={e => setOtpCode(e.target.value)} />
                      <button onClick={verifyOtp}>ভেরিফাই করুন</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="user-dashboard">
                <div className="profile-header-fb">
                  <div className="cover-img"><img src="https://via.placeholder.com/400x150/27ae60/ffffff?text=Sakib+Store" alt="Cover" /></div>
                  <div className="profile-img"><img src="https://via.placeholder.com/150/ffffff/27ae60?text=User" alt="Profile" /></div>
                  <h3>{userInfo.name || 'সম্মানিত গ্রাহক'}</h3>
                  <p>{user.phone}</p>
                </div>
                <div className="history-section">
                  <h4>📦 আমার অর্ডারসমূহ</h4>
                  {userOrders.length === 0 ? <p>কোনো অর্ডার নেই।</p> : userOrders.map(o => (
                    <div key={o.id} className="history-card">
                      <div className="hc-top"><span>{o.date}</span> <span className={`status-badge ${o.status.toLowerCase()}`}>{o.status}</span></div>
                      <p className="hc-items">{o.items.map(i => i.name).join(', ')}</p>
                      <h4>মোট: ৳{o.total}</h4>
                    </div>
                  ))}
                </div>
                <button className="logout-btn" onClick={() => {signOut(auth); setUser(null); setUserOrders([]);}}>লগআউট</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* --- Bottom Navigation (১ম ৪ ছবির একদম হুবহু) --- */}
      <footer className="bottom-nav">
        <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <span className="icon">🏠</span><small>হোম</small>
        </div>
        <div className={`nav-item ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
          <span className="icon">🗂️</span><small>ক্যাটাগরি</small>
        </div>
        <div className={`nav-item ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => setActiveTab('cart')}>
          <span className="icon">🛒</span><small>কার্ট</small>
        </div>
        <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <span className="icon">👤</span><small>প্রোফাইল</small>
        </div>
      </footer>
    </div>
  );
}

export default App;

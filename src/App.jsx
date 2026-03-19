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

const CURRENT_VERSION_CODE = 105; 
const DELIVERY_CHARGE = 50;
const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('customer');
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  
  // User & Logic States
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [userInfo, setUserInfo] = useState({ name: '', phone: '', area: '' });
  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' });
  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);
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

  // OTP Logic (নিরাপদভাবে হ্যান্ডেল করা হয়েছে)
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible'
      });
    }
  };

  const sendOtp = async () => {
    if (loginPhone.length !== 11) return alert("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন!");
    try {
      setupRecaptcha();
      const res = await signInWithPhoneNumber(auth, "+88" + loginPhone, window.recaptchaVerifier);
      setConfirmResult(res);
      setOtpSent(true);
      alert("আপনার নম্বরে কোড পাঠানো হয়েছে!");
    } catch (e) { 
      alert("Error: " + e.message); 
      if(window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
    }
  };

  const verifyOtp = async () => {
    try {
      await confirmResult.confirm(otpCode);
      setOtpSent(false);
    } catch (e) { alert("ভুল ওটিপি কোড!"); }
  };

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
    if (!userInfo.name || !userInfo.phone || !userInfo.area) return alert("দয়া করে নাম, ফোন ও ঠিকানা দিন!");
    const total = cart.reduce((a,c) => a + (c.price * c.qty), 0) + DELIVERY_CHARGE;
    await addDoc(collection(db, "orders"), {
      items: cart, userInfo, userPhone: user?.phone || userInfo.phone,
      total, status: 'Pending', date: new Date().toLocaleString(), timestamp: Date.now()
    });
    alert("অর্ডার সফলভাবে কনফার্ম হয়েছে!");
    setCart([]); setActiveTab('profile'); loadUserData(user?.phone);
  };

  const openAdmin = async () => {
    const pass = prompt("অ্যাডমিন পাসওয়ার্ড দিন:");
    if (pass === 'sakib123') {
      setViewMode('admin');
      setIsDrawerOpen(false);
      const oSnap = await getDocs(collection(db, "orders"));
      setAllOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
    } else { alert("ভুল পাসওয়ার্ড!"); }
  };

  if (viewMode === 'admin') {
    return (
      <div className="admin-page">
        <header className="app-header">
          <button className="icon-btn" onClick={() => setViewMode('customer')}>⬅</button>
          <h2>Admin Panel</h2>
        </header>
        <div className="admin-list">
          {allOrders.map(o => (
            <div key={o.id} className="admin-card">
              <p><b>#{o.id.slice(-5)}</b> | ৳{o.total}</p>
              <p>{o.userInfo.name} ({o.userPhone})</p>
              <select defaultValue={o.status} onChange={async (e) => {
                await updateDoc(doc(db,"orders",o.id), {status: e.target.value}); alert("স্ট্যাটাস আপডেট হয়েছে!");
              }}>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sakib-app">
      {/* Auto Update Popup */}
      {updateInfo.hasUpdate && (
        <div className="modal-overlay">
          <div className="update-modal">
            <h3>নতুন আপডেট! 🚀</h3>
            <p>অ্যাপের নতুন ভার্সন পাওয়া যাচ্ছে।</p>
            <button className="primary-btn" onClick={() => window.open(updateInfo.url)}>আপডেট করুন</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <button className="icon-btn" onClick={() => setIsDrawerOpen(true)}>☰</button>
        <h2 className="logo">SAKIB STORE</h2>
        <div className="cart-icon" onClick={() => setActiveTab('cart')}>
          🛒 {cart.length > 0 && <span className="badge">{cart.length}</span>}
        </div>
      </header>

      {/* Drawer Menu */}
      {isDrawerOpen && <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}></div>}
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header"><h3>Sakib Store</h3></div>
        <div className="drawer-links">
          <p onClick={() => {setActiveTab('home'); setIsDrawerOpen(false)}}>🏠 হোম</p>
          <p onClick={() => {setActiveTab('categories'); setIsDrawerOpen(false)}}>🗂️ ক্যাটাগরি</p>
          <p onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false)}}>🛒 কার্ট</p>
          <p onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false)}}>👤 প্রোফাইল</p>
          <p className="admin-link" onClick={openAdmin}>🛡️ অ্যাডমিন লগইন</p>
        </div>
      </div>

      <main className="main-content">
        {/* --- Home Tab --- */}
        {activeTab === 'home' && (
          <div className="home-view">
            <div className="search-container">
              <input type="text" placeholder="পণ্য খুঁজুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            
            {/* Horizontal Categories Scroll (Like Picture 1) */}
            <div className="horizontal-categories">
              {categoriesList.map(c => (
                <div key={c} className={`cat-pill ${selectedCat === c ? 'active' : ''}`} onClick={() => setSelectedCat(c)}>
                  {c}
                </div>
              ))}
            </div>

            <div className="product-grid">
              {products.filter(p => (selectedCat === 'সব পণ্য' || p.category === selectedCat) && p.name.includes(searchTerm)).map(p => (
                <div key={p.id} className="p-card">
                  <div className="p-img-box"><img src={p.image} alt={p.name} /></div>
                  <h4 className="p-title">{p.name}</h4>
                  <p className="p-price">৳{p.price}/{p.unit}</p>
                  <button className="add-btn" onClick={() => handleCart(p, 'add')}>+ যোগ করুন</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Category Tab (Like Picture 3) --- */}
        {activeTab === 'categories' && (
          <div className="category-view">
            <h3 className="page-title">সকল ক্যাটাগরি</h3>
            <div className="vertical-cat-list">
              {categoriesList.map(c => (
                <div key={c} className={`v-cat-item ${selectedCat === c ? 'active' : ''}`} onClick={() => {setSelectedCat(c); setActiveTab('home');}}>
                  <span>{c}</span><span className="arrow">➔</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Cart Tab (Like Picture 4 & 5) --- */}
        {activeTab === 'cart' && (
          <div className="cart-view">
            <h3 className="page-title">শপিং কার্ট</h3>
            {cart.length === 0 ? <p className="empty-text">আপনার কার্ট খালি!</p> : cart.map(item => (
              <div key={item.id} className="cart-card">
                <div className="cart-info"><h4>{item.name}</h4><p>৳{item.price}</p></div>
                <div className="qty-box">
                  <button onClick={() => handleCart(item, 'remove')}>-</button>
                  <span>{item.qty}</span>
                  <button onClick={() => handleCart(item, 'add')}>+</button>
                </div>
              </div>
            ))}

            {cart.length > 0 && (
              <div className="checkout-section">
                <h3 className="page-title">অর্ডার কনফার্মেশন</h3>
                <div className="input-group">
                  <input placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} />
                  <input placeholder="মোবাইল নম্বর" value={userInfo.phone} onChange={e => setUserInfo({...userInfo, phone: e.target.value})} />
                  <textarea placeholder="বিস্তারিত ঠিকানা" value={userInfo.area} onChange={e => setUserInfo({...userInfo, area: e.target.value})} />
                </div>
                <div className="bill-box">
                  <p>সাবটোটাল: <span>৳{cart.reduce((a,c)=>a+(c.price*c.qty),0)}</span></p>
                  <p>ডেলিভারি চার্জ: <span>৳{DELIVERY_CHARGE}</span></p>
                  <h4>সর্বমোট: <span>৳{cart.reduce((a,c)=>a+(c.price*c.qty),0)+DELIVERY_CHARGE}</span></h4>
                </div>
                <button className="primary-btn full-width" onClick={submitOrder}>অর্ডার করুন (৳{cart.reduce((a,c)=>a+(c.price*c.qty),0)+DELIVERY_CHARGE})</button>
              </div>
            )}
          </div>
        )}

        {/* --- Profile Tab (Like Picture 6 & 7) --- */}
        {activeTab === 'profile' && (
          <div className="profile-view">
            <div id="recaptcha-container"></div>
            {!user ? (
              <div className="login-card">
                <h3 className="page-title">লগইন করুন</h3>
                <input type="tel" placeholder="মোবাইল নম্বর (017...)" onChange={e => setLoginPhone(e.target.value)} />
                {!otpSent ? <button className="primary-btn" onClick={sendOtp}>OTP পাঠান</button> : (
                  <>
                    <input type="number" placeholder="OTP কোড দিন" onChange={e => setOtpCode(e.target.value)} />
                    <button className="primary-btn" onClick={verifyOtp}>ভেরিফাই করুন</button>
                  </>
                )}
              </div>
            ) : (
              <div className="logged-in-profile">
                <h3 className="page-title">আমার প্রোফাইল</h3>
                <div className="profile-header-card">
                  <div className="cover-photo"></div>
                  <div className="pro-pic"><img src="https://via.placeholder.com/100/27ae60/ffffff?text=U" alt="User" /></div>
                  <h3 className="user-name">{userInfo.name || 'সম্মানিত গ্রাহক'}</h3>
                  <p className="user-phone">{user.phone}</p>
                </div>
                
                <div className="order-history-box">
                  <h4>📦 আমার অর্ডারসমূহ</h4>
                  {userOrders.length === 0 ? <p className="empty-text">কোনো অর্ডার নেই।</p> : userOrders.map(o => (
                    <div key={o.id} className="history-item">
                      <div className="h-top"><span>{o.date}</span> <span className={`status ${o.status.toLowerCase()}`}>{o.status}</span></div>
                      <p className="h-desc">{o.items.map(i => `${i.name}(${i.qty})`).join(', ')}</p>
                      <h4>মোট: ৳{o.total}</h4>
                    </div>
                  ))}
                </div>
                <button className="logout-btn" onClick={() => signOut(auth)}>লগআউট</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation (আগের ডিজাইনের ধারাবাহিকতা রক্ষার্থে) */}
      <footer className="bottom-nav">
        <div className={`nav-icon ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>🏠<span>হোম</span></div>
        <div className={`nav-icon ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>🗂️<span>ক্যাটাগরি</span></div>
        <div className={`nav-icon ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => setActiveTab('cart')}>🛒<span>কার্ট</span></div>
        <div className={`nav-icon ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>👤<span>প্রোফাইল</span></div>
      </footer>
    </div>
  );
}
export default App;

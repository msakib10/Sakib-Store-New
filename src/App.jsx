import React, { useState, useEffect } from 'react';
// ১. এখানে initializeApp ইম্পোর্ট করা হয়েছে যা আগে ছিল না
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, getDoc, deleteDoc, query, where, orderBy } from "firebase/firestore";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "firebase/auth";
import './App.css';

// --- ধাপ ২: ফায়ারবেস কনফিগারেশন এবং হেল্পার ফাংশন --- 
const firebaseConfig = {
  apiKey: "AIzaSyBSKT8knhfyLHSuz-Z8nnj3jrYn2KBcP0M",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b"
};

// ১. ইউনিট বা পরিমাণ পার্স করার ফাংশন
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

// ২. সংখ্যাকে বাংলায় রূপান্তর করার ফাংশন
const toBanglaNum = (num) => {
  if(!num && num !== 0) return '০';
  return Number(num).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
};

// ৩. ডেলিভারি চার্জ নির্ধারণের লজিক
const getDeliveryCharge = (area, district) => {
  const specialAreas = ['গোবিন্দল', 'সিংগাইর বাজার', 'পুকুরপাড়া', 'বকচর', 'নীলটেক'];
  if (specialAreas.some(a => area && area.includes(a))) return 20;
  if (district && district.includes('সিংগাইর')) return 30;
  return 100; 
};

// ৪. ফায়ারবেস ইনিশিয়ালাইজেশন (ফাংশনের বাইরে রাখা ভালো)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export default function App() {
  // --- ধাপ ৩: স্টেট ভেরিয়েবলসমূহ --- 
  const CURRENT_VERSION_CODE = 105; 
  const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];
  const unitList = ['কেজি', 'লিটার', 'পিস', 'হালি', 'ডজন', 'গ্রাম', 'প্যাকেট']; 

  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম!'); 

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState(''); 

  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [userInfo, setUserInfo] = useState({ 
    name: '', phone: '', district: '', area: '', address: '', paymentMethod: 'Cash on Delivery' 
  }); 

  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null); 

  const [adminPass, setAdminPass] = useState('');
  const [adminTab, setAdminTab] = useState('orders'); 
  const [allOrders, setAllOrders] = useState([]);
  const [editId, setEditId] = useState(null);
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: 'কেজি', synonyms: '' }); 

  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' }); 

  // --- ধাপ ৪: useEffect এবং ডেটা ফেচিং --- 
  useEffect(() => {
    fetchProducts();
    checkUpdate();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        loadUserData(u.uid);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchProducts = async () => {
    try {
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) { console.error(err); }
  };

  const loadUserData = async (uid) => {
    try {
      const uDoc = await getDoc(doc(db, 'users', uid));
      if (uDoc.exists()) setUserInfo(uDoc.data()); 
      const q = query(collection(db, 'orders'), where('userId', '==', uid));
      const oSnap = await getDocs(q);
      const oList = oSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUserOrders(oList.sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) { console.error(err); }
  };

  const checkUpdate = async () => {
    try {
      const uDoc = await getDoc(doc(db, 'appConfig', 'updateInfo'));
      if (uDoc.exists()) {
        const data = uDoc.data();
        if (data.versionCode > CURRENT_VERSION_CODE) {
          setUpdateInfo({ hasUpdate: true, url: data.url, version: data.versionName });
        }
      }
    } catch (err) { console.warn(err); }
  };

  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCat === 'সব পণ্য' || p.category === selectedCat;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (p.synonyms && p.synonyms.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  // --- ধাপ ৫: ফাংশনসমূহ --- 
  const sendOTP = async () => {
    if (!loginPhone || loginPhone.length < 11) { alert("সঠিক মোবাইল নম্বর দিন"); return; }
    try {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      const confirmation = await signInWithPhoneNumber(auth, "+88" + loginPhone, verifier);
      setConfirmResult(confirmation);
      setOtpSent(true);
      alert("ওটিপি পাঠানো হয়েছে।");
    } catch (err) { alert("ওটিপি পাঠানো যায়নি।"); }
  };

  const verifyOTP = async () => {
    try {
      const res = await confirmResult.confirm(otpCode);
      setUser(res.user);
      loadUserData(res.user.uid);
      setOtpSent(false);
      alert("লগইন সফল!");
    } catch (err) { alert("ভুল ওটিপি!"); }
  };

  const addToCart = (product) => {
    const { baseQty, step } = parseUnitStr(product.unit);
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + step } : item));
    } else {
      setCart([...cart, { ...product, qty: baseQty }]);
    }
  };

  const removeFromCart = (pid) => {
    const existing = cart.find(item => item.id === pid);
    if (!existing) return;
    const { step } = parseUnitStr(existing.unit);
    if (existing.qty <= step) {
      setCart(cart.filter(item => item.id !== pid));
    } else {
      setCart(cart.map(item => item.id === pid ? { ...item, qty: item.qty - step } : item));
    }
  };

  const cartTotal = cart.reduce((sum, item) => {
    const { baseQty } = parseUnitStr(item.unit);
    return sum + (item.price * (item.qty / baseQty));
  }, 0);

  const handleLogout = () => { signOut(auth); setUser(null); setCart([]); setIsDrawerOpen(false); };

  const placeOrder = async () => {
    if (!user) { alert("লগইন করুন"); return; }
    if (cart.length === 0) { alert("কার্ট খালি"); return; }
    const dCharge = getDeliveryCharge(userInfo.area, userInfo.district);
    const orderData = {
      userId: user.uid, items: cart, totalAmount: cartTotal + dCharge,
      deliveryCharge: dCharge, status: 'Pending', userInfo: userInfo,
      timestamp: Date.now(), orderDate: new Date().toLocaleString('bn-BD')
    };
    try {
      await addDoc(collection(db, 'orders'), orderData);
      setCart([]); alert("অর্ডার সফল!"); setActiveTab('orders'); loadUserData(user.uid);
    } catch (err) { alert("ব্যর্থ হয়েছে!"); }
  };

  const saveProduct = async () => {
    const pData = { ...newP, price: parseFloat(newP.price), stock: parseInt(newP.stock), createdAt: Date.now() };
    try {
      if (editId) { await updateDoc(doc(db, 'products', editId), pData); alert("আপডেট হয়েছে"); }
      else { await addDoc(collection(db, 'products'), pData); alert("যোগ হয়েছে"); }
      setEditId(null); setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: 'কেজি', synonyms: '' });
      fetchProducts();
    } catch (err) { alert("ত্রুটি!"); }
  };

  const fetchAllOrders = async () => {
    const q = query(collection(db, 'orders'), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const updateOrderStatus = async (id, status) => {
    await updateDoc(doc(db, 'orders', id), { status });
    alert("স্ট্যাটাস আপডেট হয়েছে");
    fetchAllOrders();
  };

  // --- ধাপ ৬: রেন্ডার ফাংশনসমূহ --- 
  const renderHome = () => (
    <>
      <input type="text" placeholder="পণ্য খুঁজুন..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', overflowX: 'auto', padding: '10px 0', gap: '10px' }}>
        {categoriesList.map(cat => (
          <button key={cat} onClick={() => setSelectedCat(cat)} style={{ padding: '8px 20px', borderRadius: '20px', border: 'none', backgroundColor: selectedCat === cat ? '#2e7d32' : '#fff', color: selectedCat === cat ? '#fff' : '#333', whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{cat}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginTop: '15px' }}>
        {filteredProducts.map(product => {
          const { baseQty, text } = parseUnitStr(product.unit);
          const inCart = cart.find(c => c.id === product.id);
          return (
            <div key={product.id} style={{ backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <img src={product.image || 'https://via.placeholder.com/150'} alt="" style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
              <div style={{ padding: '10px' }}>
                <h3 style={{ fontSize: '14px', margin: '0' }}>{product.name}</h3>
                <p style={{ color: '#2e7d32', fontWeight: 'bold' }}>৳{toBanglaNum(product.price)} / {toBanglaNum(baseQty)} {text}</p>
                {inCart ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e8f5e9', borderRadius: '5px' }}>
                    <button onClick={() => removeFromCart(product.id)} style={{ padding: '5px 12px', background: '#2e7d32', color: '#fff', border: 'none' }}>-</button>
                    <span>{toBanglaNum(inCart.qty)}</span>
                    <button onClick={() => addToCart(product)} style={{ padding: '5px 12px', background: '#2e7d32', color: '#fff', border: 'none' }}>+</button>
                  </div>
                ) : (
                  <button onClick={() => addToCart(product)} style={{ width: '100%', padding: '8px', backgroundColor: '#2e7d32', color: '#fff', border: 'none', borderRadius: '5px' }}>কার্টে যোগ করুন</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const renderCart = () => {
    const dCharge = getDeliveryCharge(userInfo.area, userInfo.district);
    return (
      <div style={{ padding: '10px' }}>
        <h2>অর্ডার সামারি</h2>
        {cart.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
            <span>{item.name} ({toBanglaNum(item.qty)})</span>
            <span>৳{toBanglaNum(item.price * (item.qty / parseUnitStr(item.unit).baseQty))}</span>
          </div>
        ))}
        <div style={{ marginTop: '20px', background: '#fff', padding: '15px', borderRadius: '8px' }}>
          <p>পণ্যের দাম: ৳{toBanglaNum(cartTotal)}</p>
          <p style={{ color: 'red' }}>ডেলিভারি চার্জ: ৳{toBanglaNum(dCharge)}</p>
          <h3 style={{ color: '#2e7d32' }}>সর্বমোট: ৳{toBanglaNum(cartTotal + dCharge)}</h3>
        </div>
        {user ? (
          <div style={{ marginTop: '20px' }}>
            <input type="text" placeholder="আপনার নাম" value={userInfo.name} onChange={(e) => setUserInfo({...userInfo, name: e.target.value})} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
            <input type="text" placeholder="মোবাইল" value={userInfo.phone} onChange={(e) => setUserInfo({...userInfo, phone: e.target.value})} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
            <textarea placeholder="বিস্তারিত ঠিকানা" value={userInfo.address} onChange={(e) => setUserInfo({...userInfo, address: e.target.value})} style={{ width: '100%', padding: '10px' }}></textarea>
            <button onClick={placeOrder} style={{ width: '100%', padding: '15px', backgroundColor: '#2e7d32', color: '#fff', border: 'none', borderRadius: '8px', marginTop: '10px', fontWeight: 'bold' }}>অর্ডার কনফার্ম করুন</button>
          </div>
        ) : <button onClick={() => setActiveTab('profile')} style={{ width: '100%', padding: '15px', marginTop: '20px' }}>লগইন করুন</button>}
      </div>
    );
  };

  const renderAdmin = () => {
    if (adminPass !== '1234') return <div style={{ padding: '20px' }}><h3>অ্যাডমিন পাসওয়ার্ড</h3><input type="password" onChange={(e) => setAdminPass(e.target.value)} style={{ width: '100%', padding: '10px' }} /></div>;
    return (
      <div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => setAdminTab('orders')}>অর্ডারসমূহ</button>
          <button onClick={() => setAdminTab('products')}>প্রোডাক্ট অ্যাড</button>
        </div>
        {adminTab === 'orders' ? (
          <div>
            <button onClick={fetchAllOrders}>রিফ্রেশ</button>
            {allOrders.map(o => (
              <div key={o.id} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px', background: '#fff' }}>
                <p>{o.userInfo.name} - ৳{toBanglaNum(o.totalAmount)} ({o.status})</p>
                <button onClick={() => updateOrderStatus(o.id, 'Delivered')}>Deliver</button>
                <button onClick={() => updateOrderStatus(o.id, 'Cancelled')} style={{ color: 'red' }}>Cancel</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: '#fff', padding: '15px' }}>
            <input type="text" placeholder="নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} style={{ width: '100%', marginBottom: '10px' }} />
            <input type="number" placeholder="দাম" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} style={{ width: '100%', marginBottom: '10px' }} />
            <button onClick={saveProduct} style={{ width: '100%', background: '#2e7d32', color: '#fff', padding: '10px' }}>সেভ করুন</button>
          </div>
        )}
      </div>
    );
  };

  const renderOrders = () => (
    <div style={{ padding: '10px' }}>
      <h2>আমার অর্ডারসমূহ</h2>
      {userOrders.map(o => (
        <div key={o.id} style={{ background: '#fff', padding: '15px', marginBottom: '10px', borderRadius: '8px' }}>
          <p>আইডি: #{o.id.slice(-6)} | স্ট্যাটাস: {o.status}</p>
          <p>তারিখ: {o.orderDate}</p>
          <p style={{ fontWeight: 'bold' }}>মোট: ৳{toBanglaNum(o.totalAmount)}</p>
        </div>
      ))}
    </div>
  );

  const renderProfile = () => {
    if (user) return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>স্বাগতম, {userInfo.name || 'ইউজার'}</h2>
        <button onClick={handleLogout} style={{ width: '100%', padding: '12px', backgroundColor: 'red', color: '#fff', border: 'none', borderRadius: '8px' }}>লগআউট</button>
      </div>
    );
    return (
      <div style={{ padding: '20px', background: '#fff' }}>
        <h2>লগইন</h2>
        {!otpSent ? (
          <>
            <input type="tel" placeholder="017XXXXXXXX" value={loginPhone} onChange={e => setLoginPhone(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
            <button onClick={sendOTP} style={{ width: '100%', padding: '10px', background: '#2e7d32', color: '#fff' }}>ওটিপি পাঠান</button>
          </>
        ) : (
          <>
            <input type="text" placeholder="OTP" value={otpCode} onChange={e => setOtpCode(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
            <button onClick={verifyOTP} style={{ width: '100%', padding: '10px', background: '#2e7d32', color: '#fff' }}>ভেরিফাই</button>
          </>
        )}
      </div>
    );
  };

  // --- ফাইনাল রিটার্ন --- 
  return (
    <div style={{ fontFamily: 'Arial', backgroundColor: '#f4f4f4', minHeight: '100vh', paddingBottom: '70px' }}>
      <header style={{ position: 'sticky', top: 0, backgroundColor: '#2e7d32', color: 'white', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', zIndex: 1000 }}>
        <button onClick={() => setIsDrawerOpen(true)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px' }}>☰</button>
        <h1 style={{ fontSize: '20px' }}>সাকিব স্টোর</h1>
        <div onClick={() => setActiveTab('cart')} style={{ position: 'relative' }}>
          🛒 {cart.length > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-10px', background: 'red', borderRadius: '50%', padding: '2px 6px', fontSize: '12px' }}>{toBanglaNum(cart.length)}</span>}
        </div>
      </header>
      <marquee style={{ background: '#fff', color: 'red', padding: '5px' }}>{scrollingNotice}</marquee>
      
      {isDrawerOpen && (
        <>
          <div onClick={() => setIsDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000 }}></div>
          <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '250px', background: '#fff', zIndex: 2001, padding: '20px' }}>
            <p onClick={() => { setActiveTab('home'); setIsDrawerOpen(false); }}>🏠 হোম</p>
            <p onClick={() => { setViewMode(viewMode === 'admin' ? 'customer' : 'admin'); setIsDrawerOpen(false); }}>🛠 অ্যাডমিন</p>
            {user && <p onClick={handleLogout} style={{ color: 'red' }}>Logout</p>}
          </div>
        </>
      )}

      <main style={{ padding: '10px' }}>
        {viewMode === 'admin' ? renderAdmin() : (
          <>
            {activeTab === 'home' && renderHome()}
            {activeTab === 'cart' && renderCart()}
            {activeTab === 'profile' && renderProfile()}
            {activeTab === 'orders' && renderOrders()}
          </>
        )}
      </main>

      {updateInfo.hasUpdate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 5000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', textAlign: 'center' }}>
            <h2>আপডেট দিন!</h2>
            <a href={updateInfo.url} style={{ display: 'block', background: '#2e7d32', color: '#fff', padding: '10px', textDecoration: 'none', borderRadius: '5px' }}>এখনই আপডেট করুন</a>
          </div>
        </div>
      )}

      <div id="recaptcha-container"></div>

      {viewMode === 'customer' && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', display: 'flex', justifyContent: 'space-around', padding: '10px 0', boxShadow: '0 -2px 5px rgba(0,0,0,0.1)' }}>
          <div onClick={() => setActiveTab('home')}>🏠</div>
          <div onClick={() => setActiveTab('cart')}>🛒</div>
          <div onClick={() => setActiveTab('orders')}>📦</div>
          <div onClick={() => setActiveTab('profile')}>👤</div>
        </nav>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
// নতুন: ফায়ারবেস অথেন্টিকেশন ইম্পোর্ট করা হলো
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import './App.css';

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
const auth = getAuth(app); // নতুন: অথেন্টিকেশন চালু করা হলো

const CURRENT_APP_VERSION = 104; 

const categoriesList = ['পাইকারি', 'চাল', 'ডাল', 'তেল', 'পানীয়', 'অন্যান্য'];
const unitList = ['কেজি', 'লিটার', 'পিস', 'হালি', 'ডজন', 'গ্রাম', 'প্যাকেট'];
const DELIVERY_CHARGE = 50; 

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); 
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryNav, setSelectedCategoryNav] = useState('সব');
  
  // Customer & Checkout State
  const [customer, setCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', house: '', area: '', postOffice: '', upazila: '', district: '', division: '', note: '' });
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [paymentDetails, setPaymentDetails] = useState({ senderNumber: '', trxId: '' });
  
  // Login States (REAL OTP)
  const [loginPhone, setLoginPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null); // OTP কনফার্ম করার জন্য

  // Admin State
  const [adminPass, setAdminPass] = useState('');
  const [adminTab, setAdminTab] = useState('orders');
  const [allOrders, setAllOrders] = useState([]);
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'পাইকারি', stock: 10, unit: 'কেজি' });
  const [editId, setEditId] = useState(null);

  const [updateData, setUpdateData] = useState({ hasUpdate: false, url: '', code: CURRENT_APP_VERSION });

  const fetchData = async () => {
    try {
      const pSnap = await getDocs(collection(db, "products"));
      setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Error:", e); }
  };

  useEffect(() => { 
    fetchData(); 
    const savedUser = localStorage.getItem('sakibStoreUser');
    if(savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setCustomer(parsedUser);
      fetchCustomerProfile(parsedUser.phone);
    }
    checkUpdate();
  }, []);

  const checkUpdate = async () => {
    try {
      const docSnap = await getDoc(doc(db, "Latest", "version_info"));
      if (docSnap.exists() && docSnap.data().versionCode > CURRENT_APP_VERSION) {
        setUpdateData({ hasUpdate: true, url: docSnap.data().downloadUrl, code: docSnap.data().versionCode });
      }
    } catch (e) { console.error("Update check failed:", e); }
  };

  const fetchCustomerProfile = async (phone) => {
    try {
      const userDoc = await getDoc(doc(db, "users", phone));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setCustomerInfo(data.info || customerInfo);
        setCustomer(prev => ({ ...prev, pic: data.pic || prev.pic, cover: data.cover || prev.cover }));
      }
      const ordersSnap = await getDocs(collection(db, "orders"));
      const myOrders = ordersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.userPhone === phone)
        .sort((a, b) => b.timestamp - a.timestamp); 
      setCustomerOrders(myOrders);
    } catch (error) { console.log(error); }
  };

  // --- নতুন: আসল OTP পাঠানোর ফাংশন ---
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': (response) => {
          // reCAPTCHA solved
        }
      });
    }
  };

  const sendOtp = async () => {
    if(loginPhone.length !== 11) return alert("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXX)!");
    
    // বাংলাদেশি নম্বরের ফরম্যাট তৈরি (+880...)
    const phoneNumber = "+88" + loginPhone; 
    
    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      
      const result = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(result);
      setOtpSent(true);
      alert(`আপনার ${loginPhone} নম্বরে একটি ভেরিফিকেশন কোড পাঠানো হয়েছে!`);
    } catch (error) {
      console.error(error);
      alert("কোড পাঠাতে সমস্যা হয়েছে! নিশ্চিত করুন যে ফায়ারবেসে Phone Auth চালু করেছেন। Error: " + error.message);
    }
  };

  const handleLogin = async () => {
    if(!otpCode) return alert("দয়া করে মেসেজে আসা কোডটি দিন!");
    try {
      // আসল OTP মিলিয়ে দেখা হচ্ছে
      await confirmationResult.confirm(otpCode);
      
      const userData = { phone: loginPhone, pic: 'https://via.placeholder.com/100', cover: 'https://via.placeholder.com/400x150' };
      setCustomer(userData);
      localStorage.setItem('sakibStoreUser', JSON.stringify(userData));
      await fetchCustomerProfile(loginPhone);
      setActiveTab('home');
      setOtpSent(false); setOtpCode('');
    } catch (error) {
      alert("ভুল কোড! মেসেজটি ভালোভাবে চেক করে আবার দিন।");
    }
  };
  // ------------------------------------

  const handleLogout = () => {
    setCustomer(null);
    localStorage.removeItem('sakibStoreUser');
    setCart([]); setCustomerOrders([]);
  };

  const saveProfileImage = async (type, e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const updatedUser = { ...customer, [type]: reader.result };
        setCustomer(updatedUser);
        localStorage.setItem('sakibStoreUser', JSON.stringify(updatedUser));
        await setDoc(doc(db, "users", customer.phone), { [type]: reader.result }, { merge: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCart = (product, action) => {
    const existing = cart.find(c => c.id === product.id);
    if (action === 'add') {
      if(product.stock <= 0) return alert("স্টকে নেই!");
      if(existing && existing.qty >= product.stock) return alert("স্টকের চেয়ে বেশি দেওয়া যাবে না!");
      if (existing) setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c));
      else setCart([...cart, { ...product, qty: 1 }]);
    } else if (action === 'remove' && existing) {
      if (existing.qty === 1) setCart(cart.filter(c => c.id !== product.id));
      else setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty - 1 } : c));
    }
  };

  const cartTotal = cart.reduce((total, item) => total + (item.price * item.qty), 0);
  const grandTotal = cartTotal > 0 ? cartTotal + DELIVERY_CHARGE : 0;

  const placeOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.district || !customerInfo.area) return alert("দয়া করে প্রয়োজনীয় সব তথ্য দিন!");
    if (cart.length === 0) return alert("কার্ট খালি!");
    
    try {
      const orderData = {
        items: cart, customerInfo, 
        payment: { method: paymentMethod, ...paymentDetails }, 
        subTotal: cartTotal, deliveryCharge: DELIVERY_CHARGE, total: grandTotal, 
        status: "Pending", date: new Date().toLocaleString(), timestamp: Date.now(),
        userPhone: customer?.phone || customerInfo.phone
      };
      await addDoc(collection(db, "orders"), orderData);
      
      if(customer) {
        await setDoc(doc(db, "users", customer.phone), { info: customerInfo }, { merge: true });
        fetchCustomerProfile(customer.phone);
      }
      
      for (const item of cart) {
        await updateDoc(doc(db, "products", item.id), { stock: Number(item.stock) - Number(item.qty) });
      }
      alert(`অর্ডার সফল! আপনার অর্ডারটি গ্রহণ করা হয়েছে।`);
      setCart([]); fetchData(); setActiveTab('profile');
    } catch (error) { alert("অর্ডার করতে সমস্যা হয়েছে!"); }
  };

  // ADMIN FUNCTIONS
  const saveProduct = async () => {
    if(!newP.name || !newP.price) return alert("তথ্য অসম্পূর্ণ!");
    if(editId) {
      await updateDoc(doc(db, "products", editId), { ...newP, price: Number(newP.price), stock: Number(newP.stock) });
      alert("আপডেট হয়েছে!");
    } else {
      await addDoc(collection(db, "products"), { ...newP, price: Number(newP.price), stock: Number(newP.stock) });
      alert("যোগ হয়েছে!");
    }
    setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 10, unit: 'কেজি' });
    setEditId(null); fetchData();
  };

  const fetchAllOrders = async () => {
    const snap = await getDocs(collection(db, "orders"));
    const sortedOrders = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.timestamp - a.timestamp);
    setAllOrders(sortedOrders);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    fetchAllOrders();
    if(customer) fetchCustomerProfile(customer.phone); 
  };

  const filteredProducts = products.filter(p => 
    (selectedCategoryNav === 'সব' || p.category === selectedCategoryNav) && 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status) => {
    switch(status) {
      case 'Pending': return 'status-pending';
      case 'Confirmed': return 'status-confirmed';
      case 'Shipped': return 'status-shipped';
      case 'Delivered': return 'status-delivered';
      default: return '';
    }
  };

  // --- ADMIN VIEW ---
  if (viewMode === 'adminLogin') {
    return (
      <div className="login-screen">
        <div className="login-box admin-login-box">
          <h2>🛡️ অ্যাডমিন প্যানেল</h2>
          <p>সঠিক পাসওয়ার্ড দিয়ে প্রবেশ করুন</p>
          <input type="password" placeholder="পাসওয়ার্ড দিন" value={adminPass} onChange={e => setAdminPass(e.target.value)} />
          <button onClick={() => { if(adminPass === 'sakib123') { setViewMode('admin'); setAdminPass(''); fetchAllOrders(); } else alert('ভুল পাসওয়ার্ড!'); }}>লগইন</button>
          <button className="cancel-btn" onClick={() => setViewMode('customer')}>ফিরে যান</button>
        </div>
      </div>
    );
  }

  if (viewMode === 'admin') {
    return (
      <div className="admin-panel">
        <header className="admin-header"><button onClick={() => setViewMode('customer')}>⬅ বের হোন</button><h2>ড্যাশবোর্ড</h2></header>
        <div className="admin-tabs">
          <button className={adminTab === 'orders' ? 'active' : ''} onClick={() => {setAdminTab('orders'); fetchAllOrders();}}>অর্ডারসমূহ</button>
          <button className={adminTab === 'products' ? 'active' : ''} onClick={() => setAdminTab('products')}>পণ্য যোগ</button>
        </div>
        <div className="admin-body">
          {adminTab === 'products' && (
            <div className="form-card">
              <h3>{editId ? "✏️ এডিট করুন" : "➕ নতুন পণ্য"}</h3>
              <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} />
              <div className="two-col">
                <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} />
                <select value={newP.unit} onChange={e => setNewP({...newP, unit: e.target.value})}>
                  {unitList.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <input type="number" placeholder="স্টক" value={newP.stock} onChange={e => setNewP({...newP, stock: e.target.value})} />
              <input type="text" placeholder="ছবির লিংক" value={newP.image} onChange={e => setNewP({...newP, image: e.target.value})} />
              <select value={newP.category} onChange={e => setNewP({...newP, category: e.target.value})}>
                {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="save-btn" onClick={saveProduct}>সেভ করুন</button>
              {editId && <button className="cancel-btn" onClick={() => setEditId(null)}>বাতিল</button>}
            </div>
          )}
          {adminTab === 'orders' && (
            <div className="order-management">
              {allOrders.length === 0 ? <p>কোনো অর্ডার নেই</p> : allOrders.map(order => (
                <div key={order.id} className="admin-order-card">
                  <div className="o-header">
                    <strong>ID: #{order.id.slice(-6).toUpperCase()}</strong>
                    <select className={`status-badge ${getStatusColor(order.status)}`} value={order.status} onChange={(e) => updateOrderStatus(order.id, e.target.value)}>
                      <option value="Pending">Pending</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Shipped">Shipped</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>
                  <div className="o-customer">
                    <p><b>নাম:</b> {order.customerInfo?.name}</p>
                    <p><b>মোবাইল:</b> {order.customerInfo?.phone}</p>
                    <p><b>ঠিকানা:</b> {order.customerInfo?.house}, {order.customerInfo?.area}, {order.customerInfo?.upazila}, {order.customerInfo?.district}</p>
                  </div>
                  <div className="o-items">
                    {order.items.map((item, i) => <span key={i}>{item.name} x{item.qty}, </span>)}
                  </div>
                  <strong className="o-total">মোট: ৳{order.total}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- CUSTOMER VIEW ---
  return (
    <div className="App">
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="d-header"><h3>SAKIB STORE</h3><p>v{CURRENT_APP_VERSION}</p></div>
        <div className="d-menu">
          <div className="d-item" onClick={() => {setActiveTab('home'); setIsDrawerOpen(false);}}>🏠 হোম</div>
          <div className="d-item" onClick={() => {setActiveTab('categories'); setIsDrawerOpen(false);}}>🗂️ ক্যাটাগরি</div>
          <div className="d-item" onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false);}}>👤 আমার প্রোফাইল</div>
          <div className="d-item admin-link" onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</div>
          <div className="d-item" onClick={() => setIsDrawerOpen(false)}>❌ বন্ধ করুন</div>
        </div>
      </div>
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      <header className="app-header">
        <button className="menu-btn" onClick={() => setIsDrawerOpen(true)}>☰</button>
        <div className="brand-title"><h2>SAKIB STORE</h2></div>
        <div className="cart-icon" onClick={() => setActiveTab('cart')}>🛒<span>{cart.length}</span></div>
      </header>

      <main className="main-content">
        {activeTab === 'home' && (
          <>
            <div className="search-container"><span className="icon">🔍</span><input type="text" placeholder="পণ্য খুঁজুন..." onChange={(e) => setSearchTerm(e.target.value)} /></div>
            <div className="home-tab">
              <div className="product-grid">
                {filteredProducts.map(p => {
                  const cItem = cart.find(c => c.id === p.id);
                  return (
                    <div key={p.id} className="product-card">
                      <img src={p.image || 'https://via.placeholder.com/150'} alt={p.name} />
                      <h4>{p.name}</h4>
                      <div className="price-stock"><span className="price">৳{p.price}/{p.unit}</span><span className={`stock ${p.stock <= 0 ? 'out' : ''}`}>স্টক: {p.stock}</span></div>
                      {cItem ? (
                        <div className="qty-box"><button onClick={() => handleCart(p, 'remove')}>-</button><span>{cItem.qty}</span><button onClick={() => handleCart(p, 'add')}>+</button></div>
                      ) : (
                        <button className="add-btn" disabled={p.stock <= 0} onClick={() => handleCart(p, 'add')}>{p.stock <= 0 ? 'Out of Stock' : 'কার্টে যোগ করুন'}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'categories' && (
          <div className="categories-tab">
            <h3 className="sec-title">পণ্য ক্যাটাগরি</h3>
            <div className="cat-list">
               <button className={selectedCategoryNav === 'সব' ? 'active-cat' : ''} onClick={() => {setSelectedCategoryNav('সব'); setActiveTab('home');}}>সব পণ্য</button>
              {categoriesList.map(cat => (
                <button key={cat} className={selectedCategoryNav === cat ? 'active-cat' : ''} onClick={() => {setSelectedCategoryNav(cat); setActiveTab('home');}}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="cart-tab">
            <h3 className="sec-title">আপনার কার্ট</h3>
            {cart.length === 0 ? <p className="empty">কার্ট খালি!</p> : (
              <>
                <div className="cart-list">
                  {cart.map((item, i) => (
                    <div key={i} className="c-row"><span>{item.name} <b>(x{item.qty})</b></span><span>৳{item.price * item.qty}</span></div>
                  ))}
                  <div className="c-row delivery-row"><span>ডেলিভারি চার্জ:</span><span>৳{DELIVERY_CHARGE}</span></div>
                  <div className="c-total"><strong>সর্বমোট:</strong> <strong className="grand-total">৳{grandTotal}</strong></div>
                </div>
                <div className="checkout-form">
                  <h4>ডেলিভারি তথ্য</h4>
                  <input type="text" placeholder="আপনার পুরো নাম *" value={customerInfo.name} onChange={e=>setCustomerInfo({...customerInfo, name:e.target.value})} />
                  <input type="number" placeholder="মোবাইল নম্বর *" value={customerInfo.phone} onChange={e=>setCustomerInfo({...customerInfo, phone:e.target.value})} />
                  <div className="two-col">
                    <input type="text" placeholder="বাড়ি নং / রাস্তা *" value={customerInfo.house} onChange={e=>setCustomerInfo({...customerInfo, house:e.target.value})} />
                    <input type="text" placeholder="এলাকা *" value={customerInfo.area} onChange={e=>setCustomerInfo({...customerInfo, area:e.target.value})} />
                  </div>
                  <div className="two-col">
                    <input type="text" placeholder="উপজেলা *" value={customerInfo.upazila} onChange={e=>setCustomerInfo({...customerInfo, upazila:e.target.value})} />
                    <input type="text" placeholder="জেলা *" value={customerInfo.district} onChange={e=>setCustomerInfo({...customerInfo, district:e.target.value})} />
                  </div>
                  
                  <div className="payment-section">
                    <h4>পেমেন্ট মেথড:</h4>
                    <label><input type="radio" name="payment" value="Cash on Delivery" defaultChecked onChange={e=>setPaymentMethod(e.target.value)} /> ক্যাশ অন ডেলিভারি</label>
                  </div>
                  <button className="order-btn" onClick={placeOrder}>অর্ডার কনফার্ম করুন (৳{grandTotal})</button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-tab">
            {!customer ? (
              <div className="login-screen-wrapper">
                <div className="pro-login-card">
                  <h3>স্বাগতম! লগইন করুন</h3>
                  <p>আপনার অর্ডার হিস্ট্রি দেখতে ও সহজে কেনাকাটা করতে লগইন করুন।</p>
                  
                  {/* reCAPTCHA কন্টেইনার (এটি ফায়ারবেস অটোমেটিক হাইড করে রাখবে) */}
                  <div id="recaptcha-container"></div>
                  
                  <input type="number" placeholder="আপনার মোবাইল নম্বর (যেমন: 017XXXXXXX)" value={loginPhone} onChange={e=>setLoginPhone(e.target.value)} disabled={otpSent} />
                  
                  {!otpSent ? (
                    <button className="primary-btn" onClick={sendOtp}>ভেরিফিকেশন কোড পাঠান</button>
                  ) : (
                    <>
                      <input type="text" placeholder="মেসেজে আসা ৬ ডিজিটের কোড দিন" value={otpCode} onChange={e=>setOtpCode(e.target.value)} />
                      <button className="primary-btn" onClick={handleLogin}>যাচাই করুন ও লগইন করুন</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="pro-details-advanced">
                <div className="cover-photo-area">
                  <img src={customer.cover || 'https://via.placeholder.com/400x150'} alt="Cover" className="cover-img" />
                  <label className="edit-cover-btn">📷 কভার পরিবর্তন<input type="file" accept="image/*" onChange={(e) => saveProfileImage('cover', e)} hidden /></label>
                  
                  <div className="pro-pic-area">
                    <img src={customer.pic || 'https://via.placeholder.com/100'} alt="Profile" className="pro-img" />
                    <label className="edit-pro-btn">📷<input type="file" accept="image/*" onChange={(e) => saveProfileImage('pic', e)} hidden /></label>
                  </div>
                </div>
                
                <div className="user-info-text">
                  <h3>{customerInfo.name || 'সম্মানিত গ্রাহক'}</h3>
                  <p>{customer.phone}</p>
                  <button onClick={handleLogout} className="logout-sm-btn">লগআউট</button>
                </div>

                <div className="customer-orders-section">
                  <h4 className="sec-title">📦 আমার অর্ডারসমূহ</h4>
                  {customerOrders.length === 0 ? <p className="empty-msg">আপনি এখনো কোনো অর্ডার করেননি।</p> : (
                    customerOrders.map(order => (
                      <div key={order.id} className="my-order-card">
                        <div className="m-header">
                          <span className="o-date">{order.date}</span>
                          <span className={`status-badge ${getStatusColor(order.status)}`}>{order.status}</span>
                        </div>
                        <p className="o-id">Order ID: #{order.id.slice(-6).toUpperCase()}</p>
                        <div className="m-items">
                          {order.items.map((item, i) => <span key={i}>{item.name} (x{item.qty}) {i < order.items.length-1 ? ', ' : ''}</span>)}
                        </div>
                        <div className="m-footer"><strong>মোট বিল: ৳{order.total}</strong></div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <div onClick={()=>setActiveTab('home')} className={activeTab==='home'?'active':''}>🏠<small>হোম</small></div>
        <div onClick={()=>setActiveTab('categories')} className={activeTab==='categories'?'active':''}>🗂️<small>ক্যাটাগরি</small></div>
        <div onClick={()=>setActiveTab('cart')} className={activeTab==='cart'?'active':''}>🛒<small>কার্ট</small></div>
        <div onClick={()=>setActiveTab('profile')} className={activeTab==='profile'?'active':''}>👤<small>প্রোফাইল</small></div>
      </footer>
    </div>
  );
}
export default App;

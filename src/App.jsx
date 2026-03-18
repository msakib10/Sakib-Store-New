import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, where, getDoc } from "firebase/firestore";
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

// ভার্সন কোড (ভবিষ্যতে নতুন অ্যাপ বানালে এটি ১০৫, ১০৬ করে দেবেন)
const CURRENT_APP_VERSION = 104; 

const categoriesList = ['পাইকারি', 'চাল', 'ডাল', 'তেল', 'পানীয়', 'অন্যান্য'];
const unitList = ['কেজি', 'লিটার', 'পিস', 'হালি','খাচি', 'ডজন', 'গ্রাম', 'প্যাকেট'];
const DELIVERY_CHARGE = 50; 

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); 
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Customer & Checkout State
  const [customer, setCustomer] = useState(null);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', house: '', area: '', postOffice: '', upazila: '', district: '', division: '', note: '' });
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [paymentDetails, setPaymentDetails] = useState({ senderNumber: '', trxId: '' });
  const [loginPhone, setLoginPhone] = useState('');

  // Admin State
  const [adminPass, setAdminPass] = useState('');
  const [adminTab, setAdminTab] = useState('products');
  const [allOrders, setAllOrders] = useState([]);
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'পাইকারি', stock: 10, unit: 'কেজি' });
  const [editId, setEditId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(categoriesList[0]);

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
    if(savedUser) setCustomer(JSON.parse(savedUser));

    const checkUpdate = async () => {
      try {
        const docRef = doc(db, "Latest", "version_info");
        const docSnap = await getDoc(docRef);
        // ভার্সন কোড মেলানোর আসল লজিক (data.versionCode > CURRENT_APP_VERSION)
        if (docSnap.exists() && docSnap.data().versionCode > CURRENT_APP_VERSION) {
          setUpdateData({ hasUpdate: true, url: docSnap.data().downloadUrl, code: docSnap.data().versionCode });
        }
      } catch (e) { console.error("Update check failed:", e); }
    };
    checkUpdate();
  }, []);

  const handleLogin = () => {
    if(!loginPhone) return alert("মোবাইল নম্বর দিন!");
    const userData = { phone: loginPhone, pic: 'https://via.placeholder.com/100' };
    setCustomer(userData);
    localStorage.setItem('sakibStoreUser', JSON.stringify(userData));
    setActiveTab('home');
  };

  const handleLogout = () => {
    setCustomer(null);
    localStorage.removeItem('sakibStoreUser');
    setCart([]);
  };

  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const updatedUser = { ...customer, pic: reader.result };
        setCustomer(updatedUser);
        localStorage.setItem('sakibStoreUser', JSON.stringify(updatedUser));
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
    // অর্ডারের নাম ঠিকানা ফিক্স (সব তথ্য দিন)
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.district || !customerInfo.upazila || !customerInfo.area || !customerInfo.house) return alert("দয়া করে প্রয়োজনীয় সব তথ্য দিন!");
    if (cart.length === 0) return alert("কার্ট খালি!");
    if (paymentMethod !== 'Cash on Delivery' && (!paymentDetails.senderNumber || !paymentDetails.trxId)) return alert("পেমেন্টের তথ্য দিন!");

    try {
      await addDoc(collection(db, "orders"), {
        items: cart, 
        customerInfo, 
        payment: { method: paymentMethod, ...paymentDetails }, 
        subTotal: cartTotal,
        deliveryCharge: DELIVERY_CHARGE,
        total: grandTotal, 
        status: "Pending", 
        date: new Date().toLocaleString(), 
        userPhone: customer?.phone || customerInfo.phone
      });
      for (const item of cart) {
        await updateDoc(doc(db, "products", item.id), { stock: Number(item.stock) - Number(item.qty) });
      }
      alert(`অর্ডার সফল! আপনার অর্ডারটি গ্রহণ করা হয়েছে।`);
      setCart([]);
      fetchData(); 
      setActiveTab('profile');
    } catch (error) { alert("অর্ডার করতে সমস্যা হয়েছে!"); }
  };

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
    setEditId(null);
    fetchData();
  };

  const editProduct = (p) => {
    setNewP({ name: p.name, price: p.price, image: p.image, category: p.category || 'পাইকারি', stock: p.stock || 0, unit: p.unit || 'কেজি' });
    setEditId(p.id);
    window.scrollTo(0,0);
  };

  const fetchAllOrders = async () => {
    const snap = await getDocs(collection(db, "orders"));
    setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    alert("স্ট্যাটাস আপডেট হয়েছে!");
    fetchAllOrders();
  };

  const handleUpdateApp = () => {
    if (updateData.hasUpdate) {
      if (window.confirm(`নতুন আপডেট (v${updateData.code}) পাওয়া গেছে। ডাউনলোড করবেন?`)) window.location.href = updateData.url;
    } else alert("আপনি সর্বশেষ ভার্সন ব্যবহার করছেন।");
  };

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  // --- ADMIN VIEW ---
  if (viewMode === 'adminLogin') {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h2>🛡️ অ্যাডমিন লগইন</h2>
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
        <header className="admin-header"><button onClick={() => setViewMode('customer')}>◀️ বের হোন</button><h2>অ্যাডমিন ড্যাশবোর্ড</h2></header>
        <div className="admin-tabs">
          <button className={adminTab === 'products' ? 'active' : ''} onClick={() => setAdminTab('products')}>পণ্য</button>
          <button className={adminTab === 'orders' ? 'active' : ''} onClick={() => {setAdminTab('orders'); fetchAllOrders();}}>অর্ডার</button>
        </div>
        <div className="admin-body">
          {adminTab === 'products' && (
            <>
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
              <h4>স্টক লিস্ট</h4>
              <div className="stock-list">
                {products.map(p => (
                  <div key={p.id} className="stock-row">
                    <img src={p.image || 'https://via.placeholder.com/50'} alt="" />
                    <div className="s-info"><strong>{p.name}</strong><p>৳{p.price}/{p.unit} | স্টক: {p.stock}</p></div>
                    <div className="s-actions"><button className="e-btn" onClick={() => editProduct(p)}>✏️</button><button className="d-btn" onClick={async () => { await deleteDoc(doc(db, "products", p.id)); fetchData(); }}>❌</button></div>
                  </div>
                ))}
              </div>
            </>
          )}
          {adminTab === 'orders' && (
            <div className="order-management">
              <h4>সকল অর্ডারসমূহ</h4>
              {allOrders.length === 0 ? <p>কোনো অর্ডার নেই</p> : allOrders.map(order => (
                <div key={order.id} className="admin-order-card">
                  <div className="o-header">
                    <strong>ID: #{order.id.slice(-6).toUpperCase()}</strong>
                    <select className={`status-badge ${order.status}`} value={order.status} onChange={(e) => updateOrderStatus(order.id, e.target.value)}>
                      <option value="Pending">Pending</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Shipped">Shipped</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>
                  {/* ফিক্স: নাম ঠিকানা সুন্দরভাবে প্রদর্শন */}
                  <div className="o-customer">
                    <p><b>কাস্টমার:</b> {order.customerInfo?.name || 'Guest'}</p>
                    <p><b>মোবাইল:</b> {order.customerInfo?.phone || order.userPhone}</p>
                    <p><b>ইমেইল:</b> {order.customerInfo?.email || 'N/A'}</p>
                    <p><b>ঠিকানা:</b> {order.customerInfo?.house}, {order.customerInfo?.area}, {order.customerInfo?.upazila}, {order.customerInfo?.postOffice || ''}, {order.customerInfo?.district}</p>
                    {order.customerInfo?.note && <p><b>নোট:</b> {order.customerInfo.note}</p>}
                    <p><b>পেমেন্ট:</b> {order.payment?.method} {order.payment?.trxId && `(TrxID: ${order.payment.trxId})`}</p>
                  </div>
                  <div className="o-items">
                    {order.items.map((item, i) => <span key={i}>{item.name} x{item.qty}, </span>)}
                  </div>
                  <strong className="o-total">মোট বিল: ৳{order.total}</strong>
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
          <div className="d-item" onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false);}}>👤 প্রোফাইল</div>
          <div className="d-item" onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false);}}>🛒 কার্ট</div>
          <div className="d-item" onClick={() => {handleUpdateApp(); setIsDrawerOpen(false);}}>🔄 Update App</div>
          <div className="d-item" onClick={() => {alert("Sakib Store - সাকিব স্টোর, ঠিকানা : গোবিন্দল,নতুন বাজার, সিংগাইর, মানিকগঞ্জ, ঢাকা।প্রোপাইট: মো: মাসুদ-০১৭২৪৪০৯২১৯ এবং মো: দেলোয়ার-০১৭৩৫৩৭৬০৭৯। এখানে সকল প্রকার মুদি মাল খুচরা এবং পাইকারি বিক্রি করা হয়। যে কোন সমস্যায় আমাদের সাথে যোগাযোগ করতে পারেন।"); setIsDrawerOpen(false);}}>ℹ️ About Us</div>
          <div className="d-item admin-link" onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</div>
          <div className="d-item" onClick={() => setIsDrawerOpen(false)}>❌ বন্ধ করুন</div>
        </div>
      </div>
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      <header className="app-header">
        <button className="menu-btn" onClick={() => setIsDrawerOpen(true)}>☰</button>
        <div className="brand-title"><h2>সাকিব স্টোর</h2><p>পাইকারি ও খুচরা বিক্রেতা</p></div>
        <div className="cart-icon" onClick={() => setActiveTab('cart')}>🛒<span>{cart.length}</span></div>
      </header>

      <main className="main-content">
        {activeTab === 'home' && (
          <>
            <div className="search-container"><span className="icon">🔍</span><input type="text" placeholder="পছন্দের পণ্য খুঁজুন..." onChange={(e) => setSearchTerm(e.target.value)} /></div>
            <div className="home-tab">
              <h3 className="sec-title">সকল পণ্য</h3>
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
                  <div className="c-total"><strong>सर्वমোট:</strong> <strong className="grand-total">৳{grandTotal}</strong></div>
                </div>
                <div className="checkout-form">
                  <h4>ডেলিভারি তথ্য</h4>
                  <input type="text" placeholder="আপনার পুরো নাম *" onChange={e=>setCustomerInfo({...customerInfo, name:e.target.value})} />
                  <input type="number" placeholder="মোবাইল নম্বর *" onChange={e=>setCustomerInfo({...customerInfo, phone:e.target.value})} />
                  <input type="email" placeholder="ইমেইল (ঐচ্ছিক)" onChange={e=>setCustomerInfo({...customerInfo, email:e.target.value})} />
                  <div className="two-col">
                    <input type="text" placeholder="বাড়ি নং / রাস্তা *" onChange={e=>setCustomerInfo({...customerInfo, house:e.target.value})} />
                    <input type="text" placeholder="এলাকা *" onChange={e=>setCustomerInfo({...customerInfo, area:e.target.value})} />
                  </div>
                  <div className="two-col">
                    <input type="text" placeholder="পোস্ট অফিস" onChange={e=>setCustomerInfo({...customerInfo, postOffice:e.target.value})} />
                    <input type="text" placeholder="উপজেলা *" onChange={e=>setCustomerInfo({...customerInfo, upazila:e.target.value})} />
                  </div>
                  <div className="two-col">
                    <input type="text" placeholder="জেলা *" onChange={e=>setCustomerInfo({...customerInfo, district:e.target.value})} />
                    <input type="text" placeholder="বিভাগ" onChange={e=>setCustomerInfo({...customerInfo, division:e.target.value})} />
                  </div>
                  <input type="text" placeholder="নোট (ঐচ্ছিক)" onChange={e=>setCustomerInfo({...customerInfo, note:e.target.value})} />
                  
                  <div className="payment-section">
                    <h4>পেমেন্ট মেথড:</h4>
                    <label><input type="radio" name="payment" value="bKash" onChange={e=>setPaymentMethod(e.target.value)} /> বিকাশ (bKash)</label>
                    <label><input type="radio" name="payment" value="Nagad" onChange={e=>setPaymentMethod(e.target.value)} /> নগদ (Nagad)</label>
                    <label><input type="radio" name="payment" value="Cash on Delivery" defaultChecked onChange={e=>setPaymentMethod(e.target.value)} /> ক্যাশ অন ডেলিভারি</label>
                    {paymentMethod !== 'Cash on Delivery' && (
                      <div className="mfs-details">
                        <p className="mfs-notice">আমাদের {paymentMethod} নম্বর <b>01723539738 (Personal)</b> এ <b>৳{grandTotal}</b> Send Money করে নিচের তথ্য দিন:</p>
                        <input type="number" placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন" onChange={e=>setPaymentDetails({...paymentDetails, senderNumber: e.target.value})} />
                        <input type="text" placeholder="Transaction ID (TrxID)" onChange={e=>setPaymentDetails({...paymentDetails, trxId: e.target.value})} />
                      </div>
                    )}
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
              <div className="login-box pro-login"><h3>লগইন করুন</h3><input type="number" placeholder="মোবাইল নম্বর" value={loginPhone} onChange={e=>setLoginPhone(e.target.value)} /><button onClick={handleLogin}>লগইন</button></div>
            ) : (
              <div className="pro-details">
                <div className="pro-header">
                  {/* ২. গোল প্রোফাইল ছবির ফ্রেম (বিশাল ছবি প্রতিরোধ) */}
                  <div className="pic-wrapper">
                    <img src={customer.pic} alt="Profile" className="pro-pic" />
                    <label className="upload-icon">+<input type="file" accept="image/*" onChange={handleProfilePicChange} hidden /></label>
                  </div>
                  <h3>{customer.phone}</h3>
                  <button onClick={handleLogout} className="logout-btn">লগআউট</button>
                </div>
                <div className="pro-menu"><div className="p-item">📦 আমার অর্ডারসমূহ (ট্র্যাকিং)</div></div>
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

import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, where } from "firebase/firestore";
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

const categoriesList = ['চাল', 'ডাল', 'তেল', 'মসলা', 'ডেইরি', 'বাকি সব'];

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); 
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Customer & Checkout State
  const [customer, setCustomer] = useState(null);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', house: '', area: '', upazila: '', post: '', district: '', division: '', note: '' });
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [loginPhone, setLoginPhone] = useState('');

  // Admin State
  const [adminPass, setAdminPass] = useState('');
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'সবজি', stock: 10 });
  const [editId, setEditId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(categoriesList[0]);

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

  // Cart Logic (+/- & Total)
  const handleCart = (product, action) => {
    const existing = cart.find(c => c.id === product.id);
    if (action === 'add') {
      if(product.stock <= 0) return alert("দুঃখিত, পণ্যটি স্টকে নেই!");
      if(existing && existing.qty >= product.stock) return alert("স্টকের চেয়ে বেশি অর্ডার করা যাবে না!");
      if (existing) setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c));
      else setCart([...cart, { ...product, qty: 1 }]);
    } else if (action === 'remove' && existing) {
      if (existing.qty === 1) setCart(cart.filter(c => c.id !== product.id));
      else setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty - 1 } : c));
    }
  };

  const cartTotal = cart.reduce((total, item) => total + (item.price * item.qty), 0);

  // Place Order & Reduce Stock
  const placeOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.district) return alert("দয়া করে প্রয়োজনীয় সব তথ্য দিন!");
    if (cart.length === 0) return alert("কার্ট খালি!");

    try {
      // Create Order
      await addDoc(collection(db, "orders"), {
        items: cart, ...customerInfo, paymentMethod, total: cartTotal, status: "Pending", date: serverTimestamp(), userPhone: customer?.phone || 'Guest'
      });
      // Reduce Stock in Firebase
      for (const item of cart) {
        const productRef = doc(db, "products", item.id);
        await updateDoc(productRef, { stock: Number(item.stock) - Number(item.qty) });
      }
      alert(`অর্ডার সফল! পেমেন্ট মেথড: ${paymentMethod}`);
      setCart([]);
      fetchData(); // Refresh stock
      setActiveTab('home');
    } catch (error) { alert("অর্ডার করতে সমস্যা হয়েছে!"); }
  };

  // Admin: Save or Update Product
  const saveProduct = async () => {
    if(!newP.name || !newP.price) return alert("তথ্য অসম্পূর্ণ!");
    if(editId) {
      await updateDoc(doc(db, "products", editId), { ...newP, price: Number(newP.price), stock: Number(newP.stock) });
      alert("পণ্য আপডেট হয়েছে!");
    } else {
      await addDoc(collection(db, "products"), { ...newP, price: Number(newP.price), stock: Number(newP.stock) });
      alert("নতুন পণ্য যোগ হয়েছে!");
    }
    setNewP({ name: '', price: '', image: '', category: 'চাল', stock: 10 });
    setEditId(null);
    fetchData();
  };

  const editProduct = (p) => {
    setNewP({ name: p.name, price: p.price, image: p.image, category: p.category || 'চাল', stock: p.stock || 0 });
    setEditId(p.id);
    window.scrollTo(0,0);
  };

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  // --- ADMIN VIEW ---
  if (viewMode === 'adminLogin') {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h2>🛡️ অ্যাডমিন লগইন</h2>
          <input type="password" placeholder="পাসওয়ার্ড দিন" value={adminPass} onChange={e => setAdminPass(e.target.value)} />
          <button onClick={() => { if(adminPass === 'sakib017') { setViewMode('admin'); setAdminPass(''); } else alert('ভুল পাসওয়ার্ড!'); }}>লগইন</button>
          <button className="cancel-btn" onClick={() => setViewMode('customer')}>ফিরে যান</button>
        </div>
      </div>
    );
  }

  if (viewMode === 'admin') {
    return (
      <div className="admin-panel">
        <header className="admin-header"><button onClick={() => setViewMode('customer')}>⬅ বের হোন</button><h2>অ্যাডমিন ড্যাশবোর্ড</h2></header>
        <div className="admin-body">
          <div className="form-card">
            <h3>{editId ? "✏️ পণ্য এডিট করুন" : "➕ নতুন পণ্য যোগ করুন"}</h3>
            <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} />
            <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} />
            <input type="number" placeholder="স্টকের পরিমাণ" value={newP.stock} onChange={e => setNewP({...newP, stock: e.target.value})} />
            <input type="text" placeholder="ছবির লিংক (URL)" value={newP.image} onChange={e => setNewP({...newP, image: e.target.value})} />
            <select value={newP.category} onChange={e => setNewP({...newP, category: e.target.value})}>
              {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="save-btn" onClick={saveProduct}>{editId ? "আপডেট করুন" : "পণ্য সেভ করুন"}</button>
            {editId && <button className="cancel-btn" onClick={() => {setEditId(null); setNewP({ name: '', price: '', image: '', category: 'চাল, stock: 10 });}}>বাতিল করুন</button>}
          </div>
          <h4>স্টক ম্যানেজমেন্ট</h4>
          <div className="stock-list">
            {products.map(p => (
              <div key={p.id} className="stock-row">
                <img src={p.image || 'https://via.placeholder.com/50'} alt="" />
                <div className="s-info">
                  <strong>{p.name}</strong>
                  <p>৳{p.price} | স্টক: {p.stock} | {p.category}</p>
                </div>
                <div className="s-actions">
                  <button className="e-btn" onClick={() => editProduct(p)}>✏️</button>
                  <button className="d-btn" onClick={async () => { await deleteDoc(doc(db, "products", p.id)); fetchData(); }}>❌</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- CUSTOMER VIEW ---
  return (
    <div className="App">
      {/* Drawer Menu */}
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="d-header"><h3>SAKIB STORE</h3></div>
        <div className="d-menu">
          <div className="d-item" onClick={() => {setActiveTab('home'); setIsDrawerOpen(false);}}>🏠 হোম</div>
          <div className="d-item" onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false);}}>👤 প্রোফাইল</div>
          <div className="d-item" onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false);}}>🛒 কার্ট</div>
          <div className="d-item" onClick={() => {alert("নতুন আপডেট ডাউনলোড হচ্ছে..."); setIsDrawerOpen(false);}}>🔄 Update App</div>
          <div className="d-item" onClick={() => {alert("Sakib Store - বাংলাদেশের সেরা অনলাইন গ্রোসারি শপ।"); setIsDrawerOpen(false);}}>ℹ️ About Us</div>
          <div className="d-item admin-link" onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</div>
          <div className="d-item" onClick={() => setIsDrawerOpen(false)}>❌ বন্ধ করুন</div>
        </div>
      </div>
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      {/* Header */}
      <header className="app-header">
        <button className="menu-btn" onClick={() => setIsDrawerOpen(true)}>☰</button>
        <div className="brand-title">
          <h2>SAKIB STORE</h2>
          <p>পাইকারি ও খুচরা বিক্রেতা</p>
        </div>
        <div className="cart-icon" onClick={() => setActiveTab('cart')}>🛒<span>{cart.length}</span></div>
      </header>

      <main className="main-content">
        {/* Search Bar - Professional Location */}
        {activeTab === 'home' && (
          <div className="search-container">
             <span className="icon">🔍</span>
             <input type="text" placeholder="পণ্য খুঁজুন..." onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        )}

        {/* Home Tab */}
        {activeTab === 'home' && (
          <div className="home-tab">
            <h3 className="sec-title">সকল পণ্য</h3>
            <div className="product-grid">
              {filteredProducts.map(p => {
                const cItem = cart.find(c => c.id === p.id);
                return (
                  <div key={p.id} className="product-card">
                    <img src={p.image || 'https://via.placeholder.com/150'} alt={p.name} />
                    <h4>{p.name}</h4>
                    <div className="price-stock">
                      <span className="price">৳{p.price}</span>
                      <span className={`stock ${p.stock <= 0 ? 'out' : ''}`}>স্টক: {p.stock}</span>
                    </div>
                    {cItem ? (
                      <div className="qty-box">
                        <button onClick={() => handleCart(p, 'remove')}>-</button>
                        <span>{cItem.qty}</span>
                        <button onClick={() => handleCart(p, 'add')}>+</button>
                      </div>
                    ) : (
                      <button className="add-btn" disabled={p.stock <= 0} onClick={() => handleCart(p, 'add')}>
                        {p.stock <= 0 ? 'Out of Stock' : 'কার্টে যোগ করুন'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Categories Tab (Split View Layout) */}
        {activeTab === 'categories' && (
          <div className="split-layout">
            <div className="cat-sidebar">
              {categoriesList.map(c => (
                <div key={c} className={`cat-item ${selectedCategory === c ? 'active' : ''}`} onClick={() => setSelectedCategory(c)}>{c}</div>
              ))}
            </div>
            <div className="cat-products">
              {products.filter(p => p.category === selectedCategory).map(p => {
                const cItem = cart.find(c => c.id === p.id);
                return (
                  <div key={p.id} className="list-card">
                    <img src={p.image || 'https://via.placeholder.com/100'} alt="" />
                    <div className="l-info">
                      <h4>{p.name}</h4>
                      <p>৳{p.price} | স্টক: {p.stock}</p>
                      {cItem ? (
                        <div className="qty-box small"><button onClick={() => handleCart(p, 'remove')}>-</button><span>{cItem.qty}</span><button onClick={() => handleCart(p, 'add')}>+</button></div>
                      ) : (
                        <button className="add-btn small" disabled={p.stock<=0} onClick={() => handleCart(p, 'add')}>যোগ করুন</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cart & Checkout */}
        {activeTab === 'cart' && (
          <div className="cart-tab">
            <h3 className="sec-title">আপনার কার্ট</h3>
            {cart.length === 0 ? <p className="empty">কার্ট খালি!</p> : (
              <>
                <div className="cart-list">
                  {cart.map((item, i) => (
                    <div key={i} className="c-row">
                      <span>{item.name} <b>(x{item.qty})</b></span>
                      <span>৳{item.price * item.qty}</span>
                    </div>
                  ))}
                  <div className="c-total"><strong>সর্বমোট:</strong> <strong>৳{cartTotal}</strong></div>
                </div>

                <div className="checkout-form">
                  <h4>ডেলিভারি ও পেমেন্ট তথ্য</h4>
                  <input type="text" placeholder="আপনার পুরো নাম *" onChange={e=>setCustomerInfo({...customerInfo, name:e.target.value})} />
                  <input type="number" placeholder="মোবাইল নম্বর *" onChange={e=>setCustomerInfo({...customerInfo, phone:e.target.value})} />
                  <input type="email" placeholder="ইমেইল (ঐচ্ছিক)" onChange={e=>setCustomerInfo({...customerInfo, email:e.target.value})} />
                  <div className="two-col">
                    <input type="text" placeholder="বাড়ি নং / রাস্তা *" onChange={e=>setCustomerInfo({...customerInfo, house:e.target.value})} />
                    <input type="text" placeholder="এলাকা *" onChange={e=>setCustomerInfo({...customerInfo, area:e.target.value})} />
                  </div>
                  <div className="two-col">
                    <input type="text" placeholder="পোস্ট অফিস" onChange={e=>setCustomerInfo({...customerInfo, post:e.target.value})} />
                    <input type="text" placeholder="উপজেলা *" onChange={e=>setCustomerInfo({...customerInfo, upazila:e.target.value})} />
                  </div>
                  <div className="two-col">
                    <input type="text" placeholder="জেলা *" onChange={e=>setCustomerInfo({...customerInfo, district:e.target.value})} />
                    <input type="text" placeholder="বিভাগ" onChange={e=>setCustomerInfo({...customerInfo, division:e.target.value})} />
                  </div>
                  
                  <div className="payment-section">
                    <h4>পেমেন্ট মেথড সিলেক্ট করুন:</h4>
                    <label><input type="radio" name="payment" value="bKash" onChange={e=>setPaymentMethod(e.target.value)} /> বিকাশ (bKash)</label>
                    <label><input type="radio" name="payment" value="Nagad" onChange={e=>setPaymentMethod(e.target.value)} /> নগদ (Nagad)</label>
                    <label><input type="radio" name="payment" value="Cash on Delivery" defaultChecked onChange={e=>setPaymentMethod(e.target.value)} /> ক্যাশ অন ডেলিভারি (COD)</label>
                  </div>
                  
                  <button className="order-btn" onClick={placeOrder}>অর্ডার কনফার্ম করুন (৳{cartTotal})</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Profile */}
        {activeTab === 'profile' && (
          <div className="profile-tab">
            {!customer ? (
              <div className="login-box pro-login">
                <h3>লগইন করুন</h3>
                <input type="number" placeholder="মোবাইল নম্বর দিন" value={loginPhone} onChange={e=>setLoginPhone(e.target.value)} />
                <button onClick={handleLogin}>লগইন</button>
              </div>
            ) : (
              <div className="pro-details">
                <div className="pro-header">
                  <img src={customer.pic} alt="Profile" className="pro-pic" />
                  <h3>{customer.phone}</h3>
                  <button onClick={handleLogout} className="logout-btn">লগআউট</button>
                </div>
                <div className="pro-menu">
                  <div className="p-item" onClick={()=>setActiveTab('cart')}>📦 আমার অর্ডারসমূহ</div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Nav */}
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

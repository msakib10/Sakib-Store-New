import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); // customer, adminLogin, admin
  const [adminPass, setAdminPass] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '', note: '' });
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'সবজি' });

  // ডাটাবেস থেকে পণ্য আনা
  const fetchData = async () => {
    try {
      const pSnap = await getDocs(collection(db, "products"));
      setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };
  useEffect(() => { fetchData(); }, []);

  // কার্টে +/- লজিক
  const handleCartAction = (product, action) => {
    const existing = cart.find(c => c.id === product.id);
    if (action === 'add') {
      if (existing) {
        setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c));
      } else {
        setCart([...cart, { ...product, qty: 1 }]);
      }
    } else if (action === 'remove') {
      if (existing.qty === 1) {
        setCart(cart.filter(c => c.id !== product.id));
      } else {
        setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty - 1 } : c));
      }
    }
  };

  const placeOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.address) return alert("দয়া করে নাম, ফোন ও ঠিকানা দিন!");
    await addDoc(collection(db, "orders"), {
      items: cart, ...customerInfo,
      total: cart.reduce((a, b) => a + (b.price * b.qty), 0),
      status: "Pending", date: serverTimestamp()
    });
    alert("অর্ডার সফলভাবে সম্পন্ন হয়েছে!");
    setCart([]);
    setActiveTab('profile');
  };

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalCartItems = cart.reduce((total, item) => total + item.qty, 0);

  // --- অ্যাডমিন লগইন স্ক্রিন ---
  if (viewMode === 'adminLogin') {
    return (
      <div className="admin-login-screen">
        <div className="login-box">
          <h2>🛡️ অ্যাডমিন অ্যাক্সেস</h2>
          <p>শুধুমাত্র মালিকের জন্য</p>
          <input type="password" placeholder="গোপন পাসওয়ার্ড দিন" value={adminPass} onChange={e => setAdminPass(e.target.value)} />
          <button className="login-btn" onClick={() => {
            if (adminPass === 'sakib123') { setViewMode('admin'); setAdminPass(''); } 
            else { alert('ভুল পাসওয়ার্ড!'); }
          }}>লগইন করুন</button>
          <button className="back-btn-text" onClick={() => setViewMode('customer')}>ফিরে যান</button>
        </div>
      </div>
    );
  }

  // --- মেইন অ্যাডমিন প্যানেল ---
  if (viewMode === 'admin') {
    return (
      <div className="admin-panel">
        <header className="admin-header">
          <button onClick={() => setViewMode('customer')}>⬅️ বের হোন</button>
          <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
        </header>
        <div className="admin-body">
          <div className="add-form">
            <h3>নতুন পণ্য যোগ করুন</h3>
            <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} />
            <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} />
            <input type="text" placeholder="ছবির লিংক (URL)" value={newP.image} onChange={e => setNewP({...newP, image: e.target.value})} />
            <button className="save-btn" onClick={async () => {
              if(!newP.name || !newP.price) return alert("নাম ও দাম দিন");
              await addDoc(collection(db, "products"), {...newP, price: Number(newP.price)});
              setNewP({name:'', price:'', image:'', category:'সবজি'});
              fetchData();
              alert("ছবিসহ পণ্য যোগ হয়েছে!");
            }}>পণ্য সেভ করুন</button>
          </div>
          <h4>স্টকে থাকা পণ্যসমূহ</h4>
          <div className="stock-list">
            {products.map(p => (
              <div key={p.id} className="stock-row">
                <img src={p.image || 'https://via.placeholder.com/50'} alt="product" className="stock-img" />
                <span className="stock-name">{p.name} - ৳{p.price}</span>
                <button className="delete-btn" onClick={async () => { await deleteDoc(doc(db, "products", p.id)); fetchData(); }}>ডিলিট</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- কাস্টমার ইউজার ইন্টারফেস ---
  return (
    <div className="App">
      {/* বাম পাশের সাইড ড্রয়ার */}
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
           <h2>SAKIB STORE</h2>
           <p>তাজা গ্রোসারি বাজার</p>
        </div>
        <div className="drawer-menu">
          <div className="menu-item" onClick={() => {setActiveTab('home'); setIsDrawerOpen(false);}}>🏠 হোম পেজ</div>
          <div className="menu-item" onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false);}}>👤 আমার প্রোফাইল</div>
          <div className="menu-item" onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false);}}>🛒 শপিং কার্ট</div>
          <div className="menu-divider"></div>
          <div className="menu-item secure-admin" onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</div>
          <div className="menu-item" onClick={() => setIsDrawerOpen(false)}>❌ বন্ধ করুন</div>
        </div>
      </div>
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      <header className="main-header">
        <button className="pro-menu-btn" onClick={() => setIsDrawerOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#27ae60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div className="brand-title">
          <h2>SAKIB STORE</h2>
          <span>তাজা গ্রোসারি বাজার</span>
        </div>
        <div className="cart-icon" onClick={() => setActiveTab('cart')}>
           🛒{totalCartItems > 0 && <span>{totalCartItems}</span>}
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'home' && (
          <div className="home-view">
            {/* সার্চবার এখন ব্যানারের ভেতর, প্রফেশনাল লোকেশনে */}
            <div className="hero-section">
               <div className="search-wrapper">
                 <span className="search-icon">🔍</span>
                 <input type="text" placeholder="কী খুঁজছেন?" onChange={(e) => setSearchTerm(e.target.value)} />
               </div>
            </div>

            <h3 className="section-title">জনপ্রিয় পণ্যসমূহ</h3>
            <div className="product-grid">
              {filteredProducts.map(p => {
                const cartItem = cart.find(c => c.id === p.id);
                return (
                  <div key={p.id} className="p-card">
                    <img src={p.image || 'https://via.placeholder.com/150'} alt={p.name} />
                    <h4>{p.name}</h4>
                    <p>৳{p.price}</p>
                    {/* +/- বাটন লজিক */}
                    {cartItem ? (
                      <div className="qty-controls">
                        <button onClick={() => handleCartAction(p, 'remove')}>-</button>
                        <span>{cartItem.qty}</span>
                        <button onClick={() => handleCartAction(p, 'add')}>+</button>
                      </div>
                    ) : (
                      <button className="add-btn" onClick={() => handleCartAction(p, 'add')}>কার্টে যোগ করুন</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="category-view">
             <h3 className="section-title">সকল ক্যাটাগরি</h3>
             <div className="cat-grid">
                {['সবজি', 'ফলমূল', 'মাছ ও মাংস', 'মসলা', 'ডেইরি', 'স্ন্যাকস'].map(cat => (
                  <div key={cat} className="cat-card"><h3>{cat}</h3></div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="cart-view">
            <h3 className="section-title">আপনার কার্ট</h3>
            {cart.length === 0 ? (
              <p className="empty-cart">আপনার কার্টে কোনো পণ্য নেই।</p>
            ) : (
              <>
                <div className="cart-items-box">
                  {cart.map((item, i) => (
                    <div key={i} className="cart-item-row">
                      <span>{item.name} <b>(x{item.qty})</b></span>
                      <span>৳{item.price * item.qty}</span>
                    </div>
                  ))}
                  <div className="cart-total">
                    <strong>সর্বমোট:</strong> <strong>৳{cart.reduce((a, b) => a + (b.price * b.qty), 0)}</strong>
                  </div>
                </div>

                {/* সুন্দরভাবে সাজানো অর্ডার ফর্ম */}
                <div className="checkout-form">
                  <h4>অর্ডার ইনফরমেশন</h4>
                  <input type="text" placeholder="আপনার পুরো নাম" onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
                  <input type="number" placeholder="মোবাইল নম্বর" onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
                  <textarea placeholder="বিস্তারিত ডেলিভারি ঠিকানা (বাড়ি নং, রাস্তা, এলাকা)" rows="3" onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})}></textarea>
                  <input type="text" placeholder="ডেলিভারিম্যানের জন্য কোনো নোট (ঐচ্ছিক)" onChange={e => setCustomerInfo({...customerInfo, note: e.target.value})} />
                  <button className="confirm-btn" onClick={placeOrder}>অর্ডার কনফার্ম করুন</button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-view">
             <div className="profile-header-card">
               <div className="avatar">👤</div>
               <h2>কাস্টমার প্রোফাইল</h2>
               <p>স্বাগতম, সাকিব স্টোরে!</p>
             </div>
             <div className="profile-menu">
               <div className="p-menu-item" onClick={() => setActiveTab('cart')}>📦 আমার অর্ডার হিস্ট্রি</div>
               <div className="p-menu-item" onClick={() => alert("শীঘ্রই আসছে!")}>❤️ প্রিয় পণ্যসমূহ</div>
               <div className="p-menu-item" onClick={() => {setViewMode('adminLogin');}}>🛡️ অ্যাডমিন লগইন</div>
             </div>
          </div>
        )}
      </main>

      <footer className="footer-nav">
        <div onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'active' : ''}>
          <span className="f-icon">🏠</span><small>হোম</small>
        </div>
        <div onClick={() => setActiveTab('categories')} className={activeTab === 'categories' ? 'active' : ''}>
          <span className="f-icon">🗂️</span><small>ক্যাটাগরি</small>
        </div>
        <div onClick={() => setActiveTab('cart')} className={activeTab === 'cart' ? 'active' : ''}>
          <span className="f-icon">🛒</span><small>কার্ট</small>
        </div>
        <div onClick={() => setActiveTab('profile')} className={activeTab === 'profile' ? 'active' : ''}>
          <span className="f-icon">👤</span><small>প্রোফাইল</small>
        </div>
      </footer>
    </div>
  );
}

export default App;

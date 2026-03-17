import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
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
const DOWNLOAD_URL = "https://github.com/msakib10/Sakib-Store-New/releases";

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); 
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '' });
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'সবজি' });

  const fetchData = async () => {
    try {
      const pSnap = await getDocs(collection(db, "products"));
      setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const oSnap = await getDocs(collection(db, "orders"));
      setOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Error fetching data: ", e); }
  };

  useEffect(() => { fetchData(); }, [activeTab, viewMode]);

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const placeOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone) return alert("তথ্য দিন!");
    await addDoc(collection(db, "orders"), {
      items: cart, ...customerInfo,
      total: cart.reduce((a, b) => a + Number(b.price), 0),
      status: "Pending", date: serverTimestamp()
    });
    alert("অর্ডার সফল!");
    setCart([]);
    setActiveTab('home');
  };

  if (viewMode === 'admin') {
    return (
      <div className="admin-view">
        <header className="admin-header">
          <button onClick={() => setViewMode('customer')}>⬅️ ফিরে যান</button>
          <h2>অ্যাডমিন প্যানেল</h2>
        </header>
        <div className="admin-body">
          <div className="add-form">
            <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} />
            <input type="number" placeholder="দাম" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} />
            <button onClick={async () => {
              await addDoc(collection(db, "products"), {...newP, price: Number(newP.price)});
              setNewP({name:'', price:'', image:'', category:'সবজি'});
              fetchData();
              alert("যোগ হয়েছে!");
            }}>Save Product</button>
          </div>
          <h4>স্টক লিস্ট</h4>
          {products.map(p => (
            <div key={p.id} className="stock-row">
              <span>{p.name} - ৳{p.price}</span>
              <button onClick={async () => { await deleteDoc(doc(db, "products", p.id)); fetchData(); }}>❌</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {/* বাম পাশের ড্রয়ার */}
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header"><h3>সাকিব স্টোর</h3></div>
        <div className="drawer-menu">
          <div className="menu-item" onClick={() => {setActiveTab('home'); setIsDrawerOpen(false);}}>🏠 হোম</div>
          <div className="menu-item update-btn" onClick={() => window.open(DOWNLOAD_URL)}>🔄 Update App</div>
          <div className="menu-item admin-access" onClick={() => {setViewMode('admin'); setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</div>
          <div className="menu-item" onClick={() => setIsDrawerOpen(false)}>❌ বন্ধ করুন</div>
        </div>
      </div>
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      <header className="main-header">
        <div className="top-bar">
          <button className="menu-icon" onClick={() => setIsDrawerOpen(true)}>☰</button>
          <h2>সাকিব স্টোর</h2>
          <div className="cart-count" onClick={() => setActiveTab('cart')}>🛒<span>{cart.length}</span></div>
        </div>
        <div className="search-bar-container">
          <span className="s-icon">🔍</span>
          <input type="text" placeholder="পণ্য খুঁজুন..." onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'home' && (
          <div className="home-view">
            <div className="hero-banner">
              <h2>তাজা গ্রোসারি বাজার <br/> দোরগোড়ায়</h2>
              <button>এখনই বাজার করুন</button>
            </div>
            <div className="product-grid">
              {filteredProducts.map(p => (
                <div key={p.id} className="p-card">
                  <img src={p.image || 'https://via.placeholder.com/150'} alt="" />
                  <h4>{p.name}</h4>
                  <p>৳{p.price}</p>
                  <button onClick={() => setCart([...cart, p])}>Add</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="cart-view">
            <h3>শপিং কার্ট ({cart.length})</h3>
            {cart.map((item, i) => <div key={i} className="cart-item">{item.name} - ৳{item.price}</div>)}
            {cart.length > 0 && (
              <div className="checkout-form">
                <input type="text" placeholder="নাম" onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
                <input type="text" placeholder="ফোন" onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
                <textarea placeholder="ঠিকানা" onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})}></textarea>
                <button onClick={placeOrder}>অর্ডার কনফার্ম</button>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer-nav">
        <div onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'active' : ''}>🏠</div>
        <div onClick={() => setActiveTab('explore')}>🔍</div>
        <div onClick={() => setActiveTab('cart')}>🛒</div>
        <div onClick={() => setActiveTab('profile')}>👤</div>
      </footer>
    </div>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import './App.css'; // এই ফাইলের নিচে CSS কোড দেওয়া আছে

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

const CURRENT_VERSION = "1.0.2"; // ভার্সন আপডেট করা হয়েছে

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [viewMode, setViewMode] = useState('customer');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '' });
  const [searchTerm, setSearchTerm] = useState(''); // সার্চ ফিচার

  // ডাটা রিফ্রেশ ফাংশন
  const fetchData = async () => {
    const pSnap = await getDocs(collection(db, "products"));
    setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const oSnap = await getDocs(collection(db, "orders"));
    setOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchData(); }, [activeTab, viewMode]);

  // পণ্য খোঁজার লজিক
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const placeOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone) return alert("তথ্য পূরণ করুন!");
    await addDoc(collection(db, "orders"), {
      items: cart, ...customerInfo,
      total: cart.reduce((a, b) => a + Number(b.price), 0),
      status: "Pending", date: serverTimestamp()
    });
    alert("অর্ডার সফল হয়েছে!");
    setCart([]);
    setActiveTab('home');
  };

  // --- কাস্টমার ইউজার ইন্টারফেস ---
  const CustomerUI = () => (
    <div className="customer-wrapper">
      {/* বাম পাশের ড্রয়ার মেনু */}
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>সাকিব স্টোর</h3>
          <p>v{CURRENT_VERSION}</p>
        </div>
        <div className="drawer-menu">
          <div className="menu-item" onClick={() => {setActiveTab('home'); setIsDrawerOpen(false);}}>🏠 হোম</div>
          <div className="menu-item" onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false);}}>👤 প্রোফাইল</div>
          <div className="menu-item" onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false);}}>🛒 কার্ট ({cart.length})</div>
          <div className="menu-item highlight" onClick={() => window.open("LINK_TO_APK")}>🔄 অ্যাপ আপডেট করুন</div>
          <div className="menu-divider"></div>
          {/* অ্যাডমিন প্যানেল শুধুমাত্র এখানে থাকবে */}
          <div className="menu-item admin-link" onClick={() => {setViewMode('admin'); setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</div>
          <div className="menu-item close-item" onClick={() => setIsDrawerOpen(false)}>❌ বন্ধ করুন</div>
        </div>
      </div>
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      <header className="fixed-header">
        <div className="header-top">
          <button className="menu-trigger" onClick={() => setIsDrawerOpen(true)}>☰</button>
          <h2>সাকিব স্টোর</h2>
          <div className="cart-badge" onClick={() => setActiveTab('cart')}>🛒<span>{cart.length}</span></div>
        </div>
      </header>

      <main className="content">
        {activeTab === 'home' && (
          <div className="home-tab">
            {/* প্রফেশনাল সার্চবার */}
            <div className="search-container">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="পণ্য খুঁজুন..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="hero-banner"><h2>তাজা মুদি বাজার <br/>আপনার দোরগোড়ায়</h2></div>
            <h3>সেরা পণ্য</h3>
            <div className="product-grid">
              {(searchTerm ? filteredProducts : products).map(p => (
                <div key={p.id} className="p-card">
                  <img src={p.image || 'https://via.placeholder.com/150'} alt={p.name} />
                  <h4>{p.name}</h4>
                  <p>৳{p.price}</p>
                  <button onClick={() => setCart([...cart, p])}> Add </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ক্যাটাগরি, কার্ট, এবং প্রোফাইল সেকশন আগের মতোই থাকবে */}
      </main>

      <footer className="footer-nav">
        <div onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'active' : ''}>🏠</div>
        <div onClick={() => setActiveTab('explore')}>🔍</div>
        <div onClick={() => setActiveTab('cart')}>🛒</div>
        <div onClick={() => setActiveTab('profile')}>👤</div>
      </footer>
    </div>
  );

  // অ্যাডমিন প্যানেল ভিউ
  const AdminUI = () => (
    <div className="admin-wrapper" style={{padding: '20px'}}>
      <button onClick={() => setViewMode('customer')}>Back</button>
      <h3>অ্যাডমিন কন্ট্রোল</h3>
      {/* পণ্য যোগ/বাদ দেওয়ার ফর্ম এখানে থাকবে */}
    </div>
  );

  return (
    <div className="App">
      {viewMode === 'customer' ? <CustomerUI /> : <AdminUI />}
    </div>
  );
}

export default App;

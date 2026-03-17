


// App.jsx (চূড়ান্ত মাস্টার কোড)
import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import './App.css'; // সিএসএস ফাইল ব্যবহার বাধ্যতামূলক

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

function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); // home, products, cart, order_history
  const [viewMode, setViewMode] = useState('customer'); // customer, admin_login, admin_panel
  const [passInput, setPassInput] = useState('');

  // ডেটা লোড করা
  useEffect(() => {
    const fetchData = async () => {
      const pSnap = await getDocs(collection(db, "products"));
      setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const oSnap = await getDocs(collection(db, "orders"));
      setOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, [activeTab]);

  // অ্যাডমিন ভেরিফিকেশন
  const handleAdminAccess = () => {
    if (passInput === 'sakib789') { // গোপন পাসওয়ার্ড
      setViewMode('admin_panel');
    } else {
      alert("ভুল পাসওয়ার্ড!");
    }
  };

  // --- কাস্টমার ইন্টারফেস ---
  const CustomerUI = () => (
    <div className="customer-wrapper">
      <header className="fixed-header">
        <p>স্বাগতম</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>সাকিব স্টোর</h2> {/* ছবির মতো নাম */}
          <button onClick={() => setViewMode('admin_login')} style={{ background: 'none', color: '#888', border: 'none' }}>🛡️</button>
        </div>
      </header>

      <div className="main-content">
        {/* সার্চ বার */}
        <div className="search-bar">
          <span>🔍</span>
          <input type="text" placeholder="পণ্য খুঁজুন..." />
        </div>

        {/* ব্যানার */}
        <div className="hero-banner">
          <span>তাজা ও বিশুদ্ধ</span>
          <h2>আপনার দৈনন্দিন বাজার</h2>
          <p>সেরা মানের পণ্য, সাশ্রয়ী দামে</p>
          <button>বাজার শুরু করুন ➡️</button>
        </div>

        {/* পণ্য তালিকা সেকশন */}
        <div className="section-header">
          <h3>সব পণ্য</h3>
          <span>সব দেখুন</span>
        </div>

        <div className="product-grid">
          {products.length === 0 ? (
            <div className="empty-state">
              <span>📦</span>
              <p>কোনো পণ্য পাওয়া যায়নি</p>
            </div>
          ) : products.map(p => (
            <div key={p.id} className="p-card">
              <h4>{p.name}</h4>
              <p>৳{p.price}</p>
              <button onClick={() => setCart([...cart, p])}>Add to Cart</button>
            </div>
          ))}
        </div>
      </div>

      {/* নিচের মেনু বার */}
      <footer className="fixed-footer">
        <div onClick={() => setActiveTab('home')}>🏠 হোম</div>
        <div onClick={() => setActiveTab('products')}>🛍️ পণ্য</div>
        <div onClick={() => setActiveTab('cart')}>🛒 কার্ট ({cart.length})</div>
        <div onClick={() => setActiveTab('order_history')}>📋 অর্ডার</div>
      </footer>
    </div>
  );

  return (
    <div className="App">
      {viewMode === 'customer' && <CustomerUI />}
      
      {viewMode === 'admin_login' && (
        <div className="admin-login-box">
          <h3>অ্যাডমিন লগইন</h3>
          <input type="password" placeholder="গোপন পাসওয়ার্ড দিন" onChange={(e)=>setPassInput(e.target.value)} />
          <button onClick={handleAdminAccess}>প্রবেশ করুন</button>
          <button onClick={()=>setViewMode('customer')} style={{background: '#aaa'}}>ফিরে যান</button>
        </div>
      )}

      {viewMode === 'admin_panel' && (
        <div className="admin-dashboard">
          <h3>অ্যাডমিন ড্যাশবোর্ড (অর্ডার লিস্ট)</h3>
          {/* অর্ডার লিস্ট কোড এখানে থাকবে */}
          <button onClick={()=>setViewMode('customer')}>লগ আউট</button>
        </div>
      )}
    </div>
  );
}
export default App;

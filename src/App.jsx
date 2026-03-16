import React, { useState } from 'react';
import './App.css';

function App() {
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home');

  // পণ্যের তালিকা (পরে এটি অনলাইন থেকে আসবে)
  const products = [
    { id: 1, name: "চিনি", price: 140 },
    { id: 2, name: "ডাল", price: 120 },
  ];

  const addToCart = (p) => {
    setCart([...cart, p]);
    // এখানে নোটিফিকেশন লজিক বসানো যাবে
  };

  return (
    <div className="app-container">
      <header className="main-header">
        <h1>সাকিব স্টোর</h1>
        <div className="cart-badge">🛒 {cart.length}</div>
      </header>
      
      {/* এখানে আপনার পণ্য এবং নিচের মেনু থাকবে */}
      <nav className="bottom-nav">
        <button onClick={() => setActiveTab('home')}>🏠 হোম</button>
        <button onClick={() => setActiveTab('cart')}>🛒 কার্ট</button>
      </nav>
    </div>
  );
}
export default App;

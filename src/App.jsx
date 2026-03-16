import React, { useState, useEffect } from 'react';
import './App.css';

// এখানে আপনার Firebase থেকে ডাটা আসবে, আপাতত ডেমো ডাটা দেওয়া হলো
const demoProducts = [
  { id: 1, name: "চিনি (১ কেজি)", price: 140, image: "https://via.placeholder.com/150" },
  { id: 2, name: "মশুর ডাল", price: 120, image: "https://via.placeholder.com/150" },
  { id: 3, name: "সয়াবিন তেল", price: 180, image: "https://via.placeholder.com/150" },
];

function App() {
  const [products, setProducts] = useState(demoProducts);
  const [cartCount, setCartCount] = useState(0);

  return (
    <div className="app-container">
      {/* হেডার সেকশন */}
      <header className="main-header">
        <div className="logo">সাকিব স্টোর</div>
        <div className="cart-icon">🛒 <span>{cartCount}</span></div>
      </header>

      {/* সার্চ বার */}
      <div className="search-section">
        <input type="text" placeholder="পণ্য খুঁজুন..." className="search-input" />
      </div>

      {/* পণ্য তালিকা */}
      <main className="product-grid">
        {products.map(item => (
          <div key={item.id} className="product-card">
            <img src={item.image} alt={item.name} />
            <h4>{item.name}</h4>
            <p className="price">৳ {item.price}</p>
            <button onClick={() => setCartCount(cartCount + 1)} className="add-btn">
              কার্টে যোগ করুন
            </button>
          </div>
        ))}
      </main>

      {/* নিচের মেনু */}
      <nav className="bottom-nav">
        <button>🏠 হোম</button>
        <button>📂 ক্যাটাগরি</button>
        <button>👤 প্রোফাইল</button>
      </nav>
    </div>
  );
}

export default App;

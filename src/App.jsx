import React, { useState } from 'react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="app-container">
      {/* হেডার - ২ নং ছবির মতো সবুজ */}
      <header className="main-header">
        <div className="header-content">
          <h1>Sakib Store</h1>
          <div className="search-bar">
            <input type="text" placeholder="Search products..." />
          </div>
        </div>
      </header>

      {/* মেইন কন্টেন্ট */}
      <main className="content">
        <div className="product-grid">
          {/* এখানে আপনার পণ্যের লিস্ট থাকবে */}
          <div className="product-card">
            <img src="https://via.placeholder.com/150" alt="Product" />
            <h3>Fresh Sugar</h3>
            <p>৳ 120</p>
            <button className="add-btn">Add to Cart</button>
          </div>
          {/* আরও প্রোডাক্ট... */}
        </div>
      </main>

      {/* ২ নং ছবির মতো ফিক্সড বটম নেভিগেশন */}
      <nav className="bottom-nav">
        <div 
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} 
          onClick={() => setActiveTab('home')}
        >
          <span className="icon">🏠</span>
          <span className="label">Home</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'category' ? 'active' : ''}`} 
          onClick={() => setActiveTab('category')}
        >
          <span className="icon">📂</span>
          <span className="label">Category</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} 
          onClick={() => setActiveTab('profile')}
        >
          <span className="icon">👤</span>
          <span className="label">Profile</span>
        </div>
      </nav>
    </div>
  );
}

export default App;

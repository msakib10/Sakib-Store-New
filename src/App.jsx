import React, { useState } from 'react';
import './App.css';

const demoProducts = [
  { id: 1, name: "চিনি (১ কেজি)", price: 140, img: "https://via.placeholder.com/150" },
  { id: 2, name: "মসুর ডাল", price: 120, img: "https://via.placeholder.com/150" },
  { id: 3, name: "সয়াবিন তেল", price: 180, img: "https://via.placeholder.com/150" },
  { id: 4, name: "আটা (২ কেজি)", price: 90, img: "https://via.placeholder.com/150" },
];

function App() {
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home');

  const addToCart = (product) => {
    setCart([...cart, product]);
    alert(`${product.name} কার্টে যোগ হয়েছে!`);
  };

  return (
    <div className="app-container">
      <header className="main-header">
        <h1>সাকিব স্টোর</h1>
        <div className="cart-badge">
          🛒 <span>{cart.length}</span>
        </div>
      </header>

      <main className="content">
        {activeTab === 'home' && (
          <div className="product-grid">
            {demoProducts.map(p => (
              <div key={p.id} className="product-card">
                <img src={p.img} alt={p.name} />
                <h3>{p.name}</h3>
                <p>৳ {p.price}</p>
                <button onClick={() => addToCart(p)} className="add-btn">অর্ডার করুন</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="cart-view">
            <h2>আপনার কেনাকাটার তালিকা</h2>
            {cart.length === 0 ? <p>কার্ট খালি!</p> : (
              <ul>
                {cart.map((item, i) => <li key={i}>{item.name} - ৳{item.price}</li>)}
              </ul>
            )}
            {cart.length > 0 && <button className="checkout-btn">অর্ডার কনফার্ম করুন</button>}
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <div onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'active' : ''}>
          <span>🏠 হোম</span>
        </div>
        <div onClick={() => setActiveTab('cart')} className={activeTab === 'cart' ? 'active' : ''}>
          <span>🛒 কার্ট ({cart.length})</span>
        </div>
        <div onClick={() => setActiveTab('profile')} className={activeTab === 'profile' ? 'active' : ''}>
          <span>👤 প্রোফাইল</span>
        </div>
      </nav>
    </div>
  );
}

export default App;

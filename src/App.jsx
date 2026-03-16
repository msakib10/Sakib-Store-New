import React, { useState } from 'react';
import './App.css';

const demoProducts = [
  { id: 1, name: "চিনি (১ কেজি)", price: 140, img: "https://via.placeholder.com/150" },
  { id: 2, name: "মসুর ডাল", price: 120, img: "https://via.placeholder.com/150" },
  { id: 3, name: "সয়াবিন তেল", price: 180, img: "https://via.placeholder.com/150" },
];

function App() {
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home');

  const addToCart = (product) => {
    setCart([...cart, product]);
  };

  return (
    <div className="app-container">
      {/* হেডার যেখানে কার্ডের সংখ্যা দেখা যাবে */}
      <header className="main-header">
        <h1>সাকিব স্টোর</h1>
        <div className="cart-icon">
          🛒 <span>{cart.length}</span>
        </div>
      </header>

      <main className="content">
        {activeTab === 'home' && (
          <div className="product-grid">
            {demoProducts.map(product => (
              <div key={product.id} className="product-card">
                <img src={product.img} alt={product.name} />
                <h3>{product.name}</h3>
                <p>৳ {product.price}</p>
                <button onClick={() => addToCart(product)} className="add-btn">
                  কার্টে যোগ করুন
                </button>
              </div>
            ))}
          </div>
        )}
        
        {activeTab === 'cart' && (
          <div className="cart-details">
            <h2>আপনার কার্ডে থাকা পণ্য:</h2>
            {cart.length === 0 ? <p>কার্ড খালি!</p> : 
              cart.map((item, index) => <p key={index}>{item.name} - ৳{item.price}</p>)
            }
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => setActiveTab('home')}>🏠 হোম</button>
        <button onClick={() => setActiveTab('cart')}>📦 কার্ড ({cart.length})</button>
        <button onClick={() => setActiveTab('profile')}>👤 প্রোফাইল</button>
      </nav>
    </div>
  );
}

export default App;

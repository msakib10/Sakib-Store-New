import React, { useState, useEffect } from 'react';
import './App.css';

// ডেমো পণ্য তালিকা (পরে এটি অনলাইন ডাটাবেস থেকে আসবে)
const demoProducts = [
  { id: 1, name: "চিনি (১ কেজি)", price: 140, img: "https://via.placeholder.com/100" },
  { id: 2, name: "মসুর ডাল (১ কেজি)", price: 120, img: "https://via.placeholder.com/100" },
  { id: 3, name: "সয়াবিন তেল (১ লিটার)", price: 180, img: "https://via.placeholder.com/100" },
];

function App() {
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home');

  // কার্টে পণ্য যোগ করা বা সংখ্যা বাড়ানো
  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.id === product.id ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  // সংখ্যা কমানো বা রিমুভ করা
  const removeFromCart = (productId) => {
    const existing = cart.find(item => item.id === productId);
    if (existing.qty === 1) {
      setCart(cart.filter(item => item.id !== productId));
    } else {
      setCart(cart.map(item => 
        item.id === productId ? { ...item, qty: item.qty - 1 } : item
      ));
    }
  };

  // মোট দাম হিসাব করা
  const totalPrice = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  return (
    <div className="app-container">
      <header className="main-header">
        <h1>সাকিব স্টোর</h1>
        <div className="cart-badge" onClick={() => setActiveTab('cart')}>
          🛒 <span>{cart.reduce((a, b) => a + b.qty, 0)}</span>
        </div>
      </header>

      <main className="content">
        {activeTab === 'home' && (
          <div className="product-grid">
            {demoProducts.map(p => {
              const inCart = cart.find(item => item.id === p.id);
              return (
                <div key={p.id} className="product-card">
                  <img src={p.img} alt={p.name} />
                  <h3>{p.name}</h3>
                  <p>৳ {p.price}</p>
                  
                  {inCart ? (
                    <div className="qty-controls">
                      <button onClick={() => removeFromCart(p.id)}>-</button>
                      <span>{inCart.qty}</span>
                      <button onClick={() => addToCart(p)}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(p)} className="add-btn">Add to Cart</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="cart-view">
            <h2>শপিং কার্ট</h2>
            {cart.length === 0 ? <p>কার্ট খালি!</p> : (
              <>
                {cart.map(item => (
                  <div key={item.id} className="cart-item">
                    <span>{item.name}</span>
                    <div className="qty-controls">
                      <button onClick={() => removeFromCart(item.id)}>-</button>
                      <span>{item.qty}</span>
                      <button onClick={() => addToCart(item)}>+</button>
                    </div>
                    <span>৳ {item.price * item.qty}</span>
                  </div>
                ))}
                <div className="total-section">
                  <h3>মোট দাম: ৳ {totalPrice}</h3>
                  <button className="checkout-btn" onClick={() => alert('অর্ডারটি অনলাইনে পাঠানো হচ্ছে...')}>অর্ডার করুন</button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <div onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'active' : ''}>🏠 হোম</div>
        <div onClick={() => setActiveTab('cart')} className={activeTab === 'cart' ? 'active' : ''}>🛒 কার্ট</div>
        <div onClick={() => setActiveTab('profile')} className={activeTab === 'profile' ? 'active' : ''}>👤 প্রোফাইল</div>
      </nav>
    </div>
  );
}

export default App;

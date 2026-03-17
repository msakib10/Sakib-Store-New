
import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import './App.css';

// আপনার ফায়ারবেস কনফিগারেশন
const firebaseConfig = {
  apiKey: "AIzaSyBSKT8knhfyLHSuz-Z8nnj3jrYn2KBcP0M",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b",
  measurementId: "G-8PKWB3DK2Y"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(items);
      } catch (e) {
        console.error("পণ্য লোড করতে সমস্যা:", e);
      }
    };
    fetchProducts();
  }, []);

  const addToCart = (p) => {
    const existing = cart.find(item => item.id === p.id);
    if (existing) {
      setCart(cart.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...p, qty: 1 }]);
    }
  };

  const removeFromCart = (id) => {
    const existing = cart.find(item => item.id === id);
    if (existing.qty === 1) {
      setCart(cart.filter(item => item.id !== id));
    } else {
      setCart(cart.map(item => item.id === id ? { ...item, qty: item.qty - 1 } : item));
    }
  };

  const totalPrice = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  const confirmOrder = async () => {
    if (cart.length === 0) return alert("কার্ট খালি!");
    try {
      await addDoc(collection(db, "orders"), {
        items: cart,
        total: totalPrice,
        status: "Pending",
        customer: "Sakib",
        date: new Date()
      });
      alert("অর্ডার সফলভাবে অনলাইনে জমা হয়েছে!");
      setCart([]);
    } catch (e) {
      alert("অর্ডার পাঠাতে সমস্যা হয়েছে।");
    }
  };

  return (
    <div className="app-container">
      <header className="main-header">
        <h1>সাকিব স্টোর (অনলাইন)</h1>
        <div className="cart-badge" onClick={() => setActiveTab('cart')}>
          🛒 <span>{cart.reduce((a, b) => a + b.qty, 0)}</span>
        </div>
      </header>

      <main className="content">
        {activeTab === 'home' && (
          <div className="product-grid">
            {products.length === 0 ? <p>পণ্য লোড হচ্ছে বা ডাটাবেস খালি...</p> : products.map(p => {
              const inCart = cart.find(item => item.id === p.id);
              return (
                <div key={p.id} className="product-card">
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
                  <button className="checkout-btn" onClick={confirmOrder}>অর্ডার করুন</button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <div onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'active' : ''}>🏠 হোম</div>
        <div onClick={() => setActiveTab('cart')} className={activeTab === 'cart' ? 'active' : ''}>🛒 কার্ট</div>
      </nav>
    </div>
  );
}

export default App;

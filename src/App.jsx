import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import './App.css';

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
  const [view, setView] = useState('customer'); 
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '' });

  const fetchData = async () => {
    const pSnap = await getDocs(collection(db, "products"));
    setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const oSnap = await getDocs(collection(db, "orders"));
    setOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchData(); }, []);

  const addToCart = (p) => setCart([...cart, { ...p, qty: 1 }]);
  
  // অর্ডার প্লেস ফাংশন (ফর্ম ডাটাসহ)
  const placeOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.address) {
      alert("অনুগ্রহ করে আপনার নাম, মোবাইল নম্বর এবং ঠিকানা দিন।");
      return;
    }
    
    try {
      await addDoc(collection(db, "orders"), {
        items: cart,
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        customerAddress: customerInfo.address,
        totalAmount: cart.reduce((a, b) => a + b.price, 0),
        status: 'Pending',
        createdAt: serverTimestamp()
      });
      alert("ধন্যবাদ " + customerInfo.name + "! আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে।");
      setCart([]);
      setCustomerInfo({ name: '', phone: '', address: '' });
    } catch (e) {
      alert("অর্ডার দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    }
  };

  return (
    <div className="App">
      <header style={{ background: '#27ae60', color: 'white', padding: '10px', textAlign: 'center' }}>
        <h2>সাকিব স্টোর</h2>
      </header>

      {view === 'customer' && (
        <div style={{ padding: '20px' }}>
          <h3>পণ্যসমূহ</h3>
          <div className="product-grid">
            {products.map(p => (
              <div key={p.id} className="product-card" style={{ border: '1px solid #ddd', margin: '10px', padding: '10px' }}>
                <h4>{p.name}</h4>
                <p>৳{p.price}</p>
                <button onClick={() => addToCart(p)}>Add to Cart</button>
              </div>
            ))}
          </div>

          {cart.length > 0 && (
            <div className="order-form" style={{ marginTop: '30px', padding: '20px', background: '#f9f9f9', borderRadius: '10px' }}>
              <h3>ডেলিভারি তথ্য দিন</h3>
              <input type="text" placeholder="আপনার নাম" value={customerInfo.name} onChange={(e)=>setCustomerInfo({...customerInfo, name: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '8px' }} /><br/>
              <input type="text" placeholder="মোবাইল নম্বর" value={customerInfo.phone} onChange={(e)=>setCustomerInfo({...customerInfo, phone: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '8px' }} /><br/>
              <textarea placeholder="বিস্তারিত ঠিকানা (গ্রাম, থানা, জেলা)" value={customerInfo.address} onChange={(e)=>setCustomerInfo({...customerInfo, address: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '8px' }}></textarea><br/>
              <button onClick={placeOrder} className="checkout-btn" style={{ width: '100%', padding: '15px', background: '#27ae60', color: 'white', border: 'none' }}>
                অর্ডার নিশ্চিত করুন (৳{cart.reduce((a,b)=>a+b.price,0)})
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* অ্যাডমিন ভিউতে আপনি এখন এই নাম ও ফোন নম্বরগুলো দেখতে পাবেন */}
    </div>
  );
}

export default App;

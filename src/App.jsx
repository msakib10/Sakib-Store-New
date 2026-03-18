import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, where } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import './App.css';

// ফায়ারবেস কনফিগারেশন
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const CURRENT_VERSION = "1.0.3";
// আপনার সার্ভার বা ড্রাইভে নতুন APK-এর ডাউনলোড লিংক এখানে বসান
const NEW_APK_URL = "https://your-server.com/sakib_store_latest.apk";

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); // customer, adminLogin, admin
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customer, setCustomer] = useState(null); // কাস্টমার অবজেক্ট
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', house: '', area: '', upazila: '', post: '', district: '', division: '', note: '' });
  const fileInputRef = useRef(null);

  // ডাটা লোড করা
  const fetchData = async () => {
    try {
      const pSnap = await getDocs(collection(db, "products"));
      setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Error loading products: ", e); }
  };

  useEffect(() => {
    fetchData();
    // লোকাল স্টোরেজ থেকে কাস্টমার সেশন চেক করা
    const storedUser = localStorage.getItem('sakibStoreUser');
    if(storedUser) setCustomer(JSON.parse(storedUser));
  }, []);

  // মোবাইল নম্বর দিয়ে সাইন-ইন
  const handleSignIn = async (phone) => {
    if(!phone) return alert("মোবাইল নম্বর দিন");
    try {
      const q = query(collection(db, "customers"), where("phone", "==", phone));
      const querySnapshot = await getDocs(q);
      let userData;
      if (!querySnapshot.empty) {
        userData = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
      } else {
        const docRef = await addDoc(collection(db, "customers"), { phone, createdAt: serverTimestamp(), profilePic: '' });
        userData = { id: docRef.id, phone, profilePic: '' };
      }
      setCustomer(userData);
      localStorage.setItem('sakibStoreUser', JSON.stringify(userData));
      setActiveTab('home');
    } catch (e) { console.error("Sign-in error: ", e); }
  };

  // প্রোফাইল ছবি আপলোড
  const handleProfilePicUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !customer) return;
    try {
      const sRef = storageRef(storage, `profiles/${customer.id}`);
      await uploadBytes(sRef, file);
      const photoURL = await getDownloadURL(sRef);
      // ফায়ারবেস বা লোকাল স্টোরেজেও আপডেট করা যেতে পারে (সম্পূর্ণ ফাংশনালিটির জন্য)
      setCustomer({...customer, profilePic: photoURL});
      alert("ছবি আপলোড হয়েছে!");
    } catch (e) { console.error("Upload error: ", e); }
  };

  // ইন-অ্যাপ আপডেট লজিক
  const handleInAppUpdate = () => {
    // এখানে সার্ভার থেকে ভার্সন চেক করার আসল লজিক থাকবে
    const hasNewVersion = true; // সিমুলেশন
    if (!hasNewVersion) return alert("আপনি সর্বশেষ ভার্সন ব্যবহার করছেন।");
    if(window.confirm(`নতুন v1.0.4 উপলব্ধ। অ্যাপেই ডাউনলোড করতে চান?`)) {
      setIsDownloading(true);
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setDownloadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setIsDownloading(false);
          setDownloadProgress(0);
          // ফাইল ডাউনলোড শেষ হলে অ্যান্ড্রয়েডকে ফাইলটি ইনস্টল করার জন্য ওপেন করা
          window.location.href = NEW_APK_URL; 
        }
      }, 500); // ডাউনলোড সিমুলেশন
    }
  };

  // কার্টে +/- এবং মূল্য আপডেট লজিক
  const updateCartQuantity = (product, action) => {
    const existing = cart.find(c => c.id === product.id);
    if (!existing) {
      setCart([...cart, { ...product, qty: 1 }]);
    } else {
      if (action === 'add') {
        setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c));
      } else if (action === 'remove') {
        if (existing.qty === 1) {
          setCart(cart.filter(c => c.id !== product.id));
        } else {
          setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty - 1 } : c));
        }
      }
    }
  };

  const calculateTotalPrice = () => {
    return cart.reduce((total, item) => total + (item.price * item.qty), 0);
  };

  const placeOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.house) return alert("নাম, ফোন ও ঠিকানা দিন!");
    await addDoc(collection(db, "orders"), {
      items: cart, ...customerInfo,
      total: calculateTotalPrice(),
      status: "Pending", date: serverTimestamp(),
      customerId: customer?.id || 'guest'
    });
    alert("অর্ডার সফল! অর্ডার হিস্ট্রি দেখতে প্রোফাইল চেক করুন।");
    setCart([]);
    setActiveTab('home');
  };

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));

  // --- কাস্টমার ইন্টারফেস ---
  return (
    <div className="App">
      {/* বাম পাশের সাইড ড্রয়ার */}
      <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header"><h3>SAKIB STORE</h3><p>v{CURRENT_VERSION}</p></div>
        <div className="drawer-menu">
          <div className="menu-item" onClick={() => {setActiveTab('home'); setIsDrawerOpen(false);}}>🏠 হোম</div>
          <div className="menu-item" onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false);}}>👤 প্রোফাইল</div>
          <div className="menu-item" onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false);}}>🛒 কার্ট</div>
          {/* ইন-অ্যাপ আপডেট বাটন */}
          <div className="menu-item update-btn" onClick={handleInAppUpdate}>🔄 Update App</div>
          <div className="menu-divider"></div>
          {/* এডমিন লগইন শুধু এখানেই থাকবে */}
          <div className="menu-item admin-link" onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</div>
          <div className="menu-item" onClick={() => setIsDrawerOpen(false)}>❌ বন্ধ করুন</div>
        </div>
      </div>
      {isDrawerOpen && <div className="overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      {/* ডাউনলোড প্রোগ্রেস ওভারলে */}
      {isDownloading && (
        <div className="download-overlay">
          <div className="progress-box">
            <h4>আপডেট ডাউনলোড হচ্ছে...</h4>
            <div className="progress-bar"><div className="fill" style={{width: `${downloadProgress}%`}}></div></div>
            <p>{downloadProgress}%</p>
          </div>
        </div>
      )}

      {viewMode === 'customer' ? (
        <>
          <header className="main-header">
            <div className="top-bar">
              <button className="menu-trigger" onClick={() => setIsDrawerOpen(true)}>☰</button>
              {/* ৯ম ছবির আদলে হেডার টেক্সট */}
              <div className="brand-header">
                <h2>সাকিব স্টোর</h2>
                <span className="brand-p">পাইকারি ও খুচরা বিক্রেতা</span>
              </div>
              <div className="cart-badge" onClick={() => setActiveTab('cart')}>🛒<span>{cart.length}</span></div>
            </div>
          </header>

          <main className="content">
            {activeTab === 'home' && (
              <div className="home-view">
                <div className="search-wrapper">
                  <span className="search-icon">🔍</span>
                  {/* সার্চবার প্রফেশনাল সাদা কালার */}
                  <input type="text" placeholder="কী খুঁজছেন?" onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="hero-banner"><h2>তাজা গ্রোসারি बाजार <br/>আপনার দোরগোড়ায়</h2></div>
                <h3>সকল পণ্য</h3>
                <div className="product-grid">
                  {filteredProducts.map(p => {
                    const cartItem = cart.find(c => c.id === p.id);
                    return (
                      <div key={p.id} className="p-card">
                        <img src={p.image || 'https://via.placeholder.com/150'} alt="" />
                        <h4>{p.name}</h4>
                        {/* +/- বাটন ও মূল্য আপডেট */}
                        <p>৳{p.price}</p>
                        {cartItem ? (
                          <div className="qty-controls">
                            <button onClick={() => updateCartQuantity(p, 'remove')}>-</button>
                            <span>{cartItem.qty}</span>
                            <button onClick={() => updateCartQuantity(p, 'add')}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => updateCartQuantity(p, 'add')}>Add to Cart</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* ক্যাটাগরি, কার্ট, এবং প্রোফাইল ট্যাবের পূর্ণাঙ্গ কোড আগের মতোই থাকবে */}
          </main>
          {/* ফুটার নেভিগেশন আগের মতোই থাকবে */}
        </>
      ) : (
        {/* অ্যাডমিন প্যানেল কোড আগের মতোই থাকবে */}
      )}
    </div>
  );
}
export default App;

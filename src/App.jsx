import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, getDoc, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"; // নতুন যোগ করা হয়েছে
import './App.css';

// --- ফায়ারবেস কনফিগারেশন ---
const firebaseConfig = {
  apiKey: "AIzaSyBSKT0kmhfyLHSur-Z8nnj3jrYn2KBcP0M", // Note: apiKey এর m ঠিক করা হয়েছে
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // স্টোরেজ ইনিশিয়ালাইজ

// --- হেল্পার ফাংশন ---
const parseUnitStr = (unitStr) => {
  if (!unitStr) return { baseQty: 1, text: 'টি', step: 1 };
  const engStr = String(unitStr).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  const match = engStr.match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    const num = parseFloat(match[1]);
    const txt = match[2] ? match[2].trim() : 'টি';
    let stepAmount = 1;
    if (txt.includes('গ্রাম') || txt.includes('gm') || txt.includes('মিলি') || txt.includes('ml')) {
      stepAmount = num >= 100 ? 50 : 10;
    } else {
      stepAmount = 1; 
    }
    return { baseQty: num, text: txt, step: stepAmount };
  }
  return { baseQty: 1, text: unitStr, step: 1 };
};

const toBanglaNum = (num) => {
  if(!num && num !== 0) return '০';
  return Number(num).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
};

const getDeliveryCharge = (area, district) => {
  const specialAreas = ['গোবিন্দল', 'সিংগাইর বাজার', 'পুকুরপাড়া', 'বকচর', 'নীলটেক'];
  if (specialAreas.some(a => area && area.includes(a))) return 20;
  if (district && district.includes('সিংগাইর')) return 30;
  return 50; 
};

const getStatusColor = (status) => {
  switch (status) {
    case 'Pending': return 'st-pending';      
    case 'Confirmed': return 'st-confirmed';  
    case 'On Delivery': return 'st-delivery'; 
    case 'Delivered': return 'st-delivered';   
    case 'Cancelled': return 'st-cancelled';   
    default: return 'st-default';
  }
};

// --- মূল অ্যাপ কম্পোনেন্ট ---
export default function App() {
  const CURRENT_VERSION_CODE = 105; 
  const categoriesList = ['সব পণ্য', 'পাইকারি', 'চাল', 'ডাল', 'তেল', 'মসলা', 'পানীয়', 'অন্যান্য'];

  const [products, setProducts] = useState([]);
  const [headerImage, setHeaderImage] = useState('https://via.placeholder.com/800x300');
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম!');
  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' });

  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer'); 
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); 
  const [adminTab, setAdminTab] = useState('orders');

  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]); 
  const [userInfo, setUserInfo] = useState({ 
    name: '', phone: '', district: '', area: '', address: '', paymentMethod: 'Cash on Delivery', senderNumber: '', transactionId: '', profilePic: '', coverPhoto: ''
  });

  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  const [adminPass, setAdminPass] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  const [editId, setEditId] = useState(null); 
  const [newP, setNewP] = useState({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১কেজি', synonyms: '' });

  useEffect(() => {
    fetchProducts();
    checkUpdate();
    fetchSettings();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const phone = currentUser.phoneNumber.replace("+88", "");
        setUser({ phone });
        loadUserData(phone);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchProducts = async () => {
    const snap = await getDocs(collection(db, "products"));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const checkUpdate = async () => {
    const docSnap = await getDoc(doc(db, "Latest", "version_info"));
    if (docSnap.exists() && docSnap.data().versionCode > CURRENT_VERSION_CODE) {
      setUpdateInfo({ hasUpdate: true, url: docSnap.data().downloadUrl, version: docSnap.data().versionName });
    }
  };

  const fetchSettings = async () => {
    const noticeSnap = await getDoc(doc(db, "settings", "notice"));
    if (noticeSnap.exists()) setScrollingNotice(noticeSnap.data().text);
    const headerSnap = await getDoc(doc(db, "settings", "header"));
    if (headerSnap.exists()) setHeaderImage(headerSnap.data().url);
  };

  const loadUserData = async (phone) => {
    const uSnap = await getDoc(doc(db, "users", phone));
    if (uSnap.exists() && uSnap.data().info) {
      setUserInfo(prev => ({...prev, ...uSnap.data().info}));
    }
    const oSnap = await getDocs(query(collection(db, "orders"), where("userPhone", "==", phone)));
    setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  };

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
  };

  const sendOtp = async () => {
    if (loginPhone.length !== 11) return alert("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন!");
    try {
      setupRecaptcha();
      const formattedPhone = "+88" + loginPhone;
      const res = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      setConfirmResult(res);
      setOtpSent(true);
      alert("আপনার নম্বরে ওটিপি পাঠানো হয়েছে!");
    } catch (e) { 
      alert("সমস্যা: " + e.message); 
      if(window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
    }
  };

  const verifyOtp = async () => {
    try {
      const result = await confirmResult.confirm(otpCode);
      const phone = result.user.phoneNumber.replace("+88", "");
      setUser({ phone });
      loadUserData(phone);
      setOtpSent(false);
      alert("লগইন সফল!");
    } catch (e) { alert("ভুল ওটিপি কোড!"); }
  };

  const handleCart = (product, action) => {
    const { baseQty, step } = parseUnitStr(product.unit);
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id);
      if (action === 'add') {
        if (existing) return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty + step } : item);
        return [...prevCart, { ...product, qty: baseQty }];
      } 
      if (action === 'remove' && existing) {
        if (existing.qty > baseQty) return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty - step } : item);
        return prevCart.filter(item => item.id !== product.id);
      }
      return prevCart;
    });
  };

  const totalCartPrice = cart.reduce((acc, item) => {
    const { baseQty } = parseUnitStr(item.unit);
    return acc + (item.price / baseQty) * item.qty;
  }, 0);
  const deliveryCharge = cart.length > 0 ? getDeliveryCharge(userInfo.area, userInfo.district) : 0;
  const finalTotal = totalCartPrice + deliveryCharge;

  const submitOrder = async () => {
    if (!userInfo.name || !userInfo.phone || !userInfo.district || !userInfo.area || !userInfo.address) {
      return alert("দয়া করে ডেলিভারির জন্য সকল তথ্য দিন!");
    }
    if ((userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nagad') && (!userInfo.senderNumber || !userInfo.transactionId)) {
      return alert("বিকাশ/নগদ পেমেন্টের ক্ষেত্রে সেন্ডার নম্বর এবং TrxID দেওয়া বাধ্যতামূলক!");
    }
    
    const orderData = {
      items: cart, userInfo, userPhone: user?.phone || userInfo.phone,
      paymentMethod: userInfo.paymentMethod, total: finalTotal, 
      status: 'Pending', date: new Date().toLocaleString(), timestamp: Date.now()
    }; 

    try {
      await addDoc(collection(db, "orders"), orderData);
      const phoneToSave = user?.phone || userInfo.phone;
      await setDoc(doc(db, "users", phoneToSave), { info: userInfo }, { merge: true }); 
      alert(`অর্ডার সফল!`);
      setCart([]); 
      setActiveTab('profile'); 
      if(user) loadUserData(user.phone);
    } catch (e) {
      alert("অর্ডার সম্পন্ন করতে সমস্যা হয়েছে: " + e.message);
    }
  }; 

  // --- Profile Image Upload Logic ---
  const handleImageUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const storageRef = ref(storage, `users/${user.phone}/${type}_${file.name}`);
    try {
      alert('ছবি আপলোড হচ্ছে, দয়া করে অপেক্ষা করুন...');
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const updatedInfo = { ...userInfo, [type]: url };
      setUserInfo(updatedInfo);
      await setDoc(doc(db, "users", user.phone), { info: updatedInfo }, { merge: true });
      alert('ছবি সফলভাবে আপডেট হয়েছে!');
    } catch (error) {
      alert('ছবি আপলোডে সমস্যা হয়েছে: ' + error.message);
    }
  };

  // --- Admin Logic ---
  const fetchAllOrders = async () => {
    try {
      const snap = await getDocs(collection(db, "orders"));
      setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
    } catch(err) {
      alert("অর্ডার লোড করতে সমস্যা হচ্ছে।");
    }
  }; 

  const saveProduct = async () => {
    if (!newP.name || !newP.price) return alert("দয়া করে পণ্যের নাম ও দাম দিন!");
    try {
      if (editId) {
        await updateDoc(doc(db, "products", editId), newP);
        alert("পণ্য আপডেট হয়েছে!");
      } else {
        await addDoc(collection(db, "products"), newP);
        alert("নতুন পণ্য যোগ হয়েছে!");
      }
      setEditId(null);
      setNewP({ name: '', price: '', image: '', category: 'সব পণ্য', stock: 100, unit: '১কেজি', synonyms: '' });
      fetchProducts();
    } catch (error) { alert("সমস্যা হয়েছে: " + error.message); }
  }; 

  const editProduct = (p) => {
    setEditId(p.id);
    setNewP({ name: p.name, price: p.price, image: p.image, category: p.category, stock: p.stock, unit: p.unit, synonyms: p.synonyms || '' });
    window.scrollTo(0, 0); 
  }; 

  // --- RENDER ---
  if (viewMode === 'adminLogin') {
    return (
      <div className="login-screen" style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div className="login-box" style={{background: '#fff', padding: '30px', borderRadius: '10px', width: '90%', maxWidth: '400px'}}>
          <h2>🛡️ অ্যাডমিন লগইন</h2>
          <input type="password" placeholder="পাসওয়ার্ড দিন" value={adminPass} onChange={e => setAdminPass(e.target.value)} style={{width: '100%', padding: '10px', marginBottom: '15px'}} />
          <button className="primary-btn" onClick={async () => { 
            if(adminPass === 'sakib123') { 
              try {
                await fetchAllOrders(); 
                setViewMode('admin'); 
                setAdminPass('');
              } catch(e) { alert("লগইন এরর!"); }
            } else alert('ভুল পাসওয়ার্ড!'); 
          }} style={{width: '100%', padding: '12px', background: '#27ae60', color: '#fff', marginBottom: '10px'}}>লগইন</button>
          <button className="cancel-btn" onClick={() => setViewMode('customer')} style={{width: '100%', padding: '12px', background: '#e74c3c', color: '#fff'}}>ফিরে যান</button>
        </div>
      </div>
    );
  } 

  if (viewMode === 'admin') {
    return (
      <div className="admin-panel" style={{maxWidth: '100vw', overflowX: 'hidden'}}>
        <header className="admin-header" style={{background: '#2c3e50', color: '#fff', padding: '15px', display: 'flex', justifyContent: 'space-between'}}>
          <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
          <button onClick={() => setViewMode('customer')} style={{background: '#e74c3c', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '5px'}}>⬅ বের হোন</button>
        </header> 

        <div className="admin-body" style={{padding: '15px'}}>
          <div className="admin-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => {setAdminTab('orders'); fetchAllOrders();}} style={{ flex: 1, padding: '12px', background: adminTab === 'orders' ? '#27ae60' : '#ddd', color: adminTab === 'orders' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>📦 অর্ডারসমূহ</button>
            <button onClick={() => setAdminTab('stock')} style={{ flex: 1, padding: '12px', background: adminTab === 'stock' ? '#27ae60' : '#ddd', color: adminTab === 'stock' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>📊 স্টক ও সেটিংস</button>
          </div>

          {adminTab === 'orders' ? (
            <div className="admin-orders-section">
              <h3 style={{borderBottom: '2px solid #27ae60', paddingBottom: '10px'}}>📦 অর্ডার ম্যানেজমেন্ট</h3>
              {allOrders.length === 0 ? <p>কোনো অর্ডার নেই!</p> : (
                <div className="orders-list">
                  {allOrders.map(order => (
                    <div key={order.id} className="admin-order-card" style={{border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', background: '#f9f9f9'}}>
                      <div className="order-info">
                        <strong>অর্ডার আইডি: #{order.id.slice(-5).toUpperCase()}</strong>
                        <p>গ্রাহক: {order.userInfo.name} ({order.userPhone})</p>
                        <p>ঠিকানা: {order.userInfo.address}, {order.userInfo.area}, {order.userInfo.district}</p>
                        <p>পণ্য: {order.items.map(i => `${i.name} (${i.qty}${parseUnitStr(i.unit).text})`).join(', ')}</p>
                        <p>পেমেন্ট: <b>{order.paymentMethod}</b> | মোট: ৳{order.total}</p>
                        {(order.paymentMethod === 'Bkash' || order.paymentMethod === 'Nagad') && (
                          <p style={{color: '#d35400'}}>TrxID: {order.userInfo.transactionId} | Sender: {order.userInfo.senderNumber}</p>
                        )}
                      </div> 
                      <div className="status-control" style={{marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center'}}>
                        <select className={`status-select ${getStatusColor(order.status)}`} value={order.status} onChange={async (e) => {
                            await updateDoc(doc(db, "orders", order.id), { status: e.target.value });
                            fetchAllOrders(); 
                          }} style={{padding: '5px', borderRadius: '5px'}}>
                          <option value="Pending">Pending ⏳</option>
                          <option value="Confirmed">Confirmed ✅</option>
                          <option value="On Delivery">On Delivery 🚚</option>
                          <option value="Delivered">Delivered 🏁</option>
                          <option value="Cancelled">Cancelled ❌</option>
                        </select>
                        <button style={{background: '#ff4d4d', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px'}} onClick={async () => { if(window.confirm("ডিলিট করবেন?")) { await deleteDoc(doc(db, "orders", order.id)); fetchAllOrders(); } }}>❌</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : ( 
            <div className="admin-stock-section">
               {/* এখানে আগের মতই স্টক ম্যানেজমেন্ট কোড থাকবে */}
               <div className="form-card" style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '25px' }}>
                <h3 style={{ color: '#27ae60', marginBottom: '15px' }}>{editId ? "✏️ পণ্য এডিট করুন" : "➕ নতুন পণ্য যোগ"}</h3>
                <input type="text" placeholder="পণ্যের নাম" value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} style={{ width: '100%', marginBottom: '10px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} /> 
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e => setNewP({...newP, price: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                  <input type="text" placeholder="ইউনিট (যেমন: ১কেজি)" value={newP.unit} onChange={e => setNewP({...newP, unit: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                </div> 
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <select value={newP.category} onChange={e => setNewP({...newP, category: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}>
                    {categoriesList.filter(c => c !== 'সব পণ্য').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" placeholder="স্টক" value={newP.stock} onChange={e => setNewP({...newP, stock: e.target.value})} style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} />
                </div> 
                <input type="text" placeholder="ছবির লিংক" value={newP.image} onChange={e => setNewP({...newP, image: e.target.value})} style={{ width: '100%', marginBottom: '15px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} /> 
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={saveProduct} style={{ flex: 2, padding: '12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px' }}>{editId ? "আপডেট করুন" : "সেভ করুন"}</button>
                  {editId && <button onClick={() => { setEditId(null); setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১কেজি', synonyms: '' }); }} style={{ flex: 1, padding: '12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '8px' }}>বাতিল</button>}
                </div>
              </div>

              <div className="stock-list">
                {products.map(p => (
                  <div key={p.id} className="stock-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #eee', padding: '10px 0' }}>
                    <img src={p.image || 'https://via.placeholder.com/50'} alt="" style={{ width: '45px', height: '45px', borderRadius: '5px', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <strong>{p.name}</strong><br/>
                      <span style={{fontSize: '12px'}}>৳{p.price} / {p.unit}</span>
                    </div>
                    <button onClick={() => editProduct(p)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>✏️</button>
                    <button onClick={async () => { if(window.confirm("ডিলিট করবেন?")) { await deleteDoc(doc(db, "products", p.id)); fetchProducts(); } }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>❌</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // CUSTOMER VIEW RENDER
  // =========================================================================
  return (
    <div className="sakib-app" style={{maxWidth: '100vw', overflowX: 'hidden'}}>
      {updateInfo.hasUpdate && (
        <div className="modal-overlay" style={{position: 'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.7)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div className="update-modal" style={{background:'#fff', padding:'20px', borderRadius:'10px', textAlign:'center'}}>
            <h3>নতুন আপডেট! 🚀</h3>
            <p>অ্যাপের নতুন ভার্সন পাওয়া যাচ্ছে।</p>
            <button onClick={() => window.open(updateInfo.url)} style={{background:'#27ae60', color:'#fff', padding:'10px 20px', border:'none', borderRadius:'5px'}}>আপডেট করুন</button>
          </div>
        </div>
      )} 

      <header className="app-header" style={{ position: 'relative', width: '100%', height: '200px', overflow: 'hidden' }}>
        <img src={headerImage} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> 
        <button onClick={() => setIsDrawerOpen(true)} style={{position: 'absolute', top: '15px', left: '15px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', fontSize: '24px', padding: '5px 10px', borderRadius: '5px'}}>☰</button> 
        <div onClick={() => setActiveTab('cart')} style={{position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '8px 15px', borderRadius: '20px', fontSize: '18px', cursor: 'pointer'}}>
          🛒 {cart.length > 0 && <span style={{background: '#e74c3c', color: '#fff', borderRadius: '50%', padding: '2px 6px', fontSize: '12px', marginLeft: '5px'}}>{cart.length}</span>}
        </div>
      </header> 

      <div className="notice-bar" style={{background: '#f39c12', color: '#fff', padding: '5px 0'}}>
        <marquee direction="left" scrollamount="5">📢 {scrollingNotice} 📢</marquee>
      </div>

      {isDrawerOpen && <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)} style={{position: 'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', zIndex: 100}}></div>}
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`} style={{position: 'fixed', top:0, left: isDrawerOpen ? 0 : '-300px', width: '250px', height: '100%', background: '#fff', zIndex: 101, transition: '0.3s', boxShadow: '2px 0 10px rgba(0,0,0,0.2)'}}>
        <div style={{background: '#27ae60', color: '#fff', padding: '20px', fontSize: '20px', fontWeight: 'bold'}}>সাকিব স্টোর</div>
        <div style={{padding: '10px', display: 'flex', flexDirection: 'column', gap: '15px'}}>
          <p onClick={() => {setActiveTab('home'); setIsDrawerOpen(false)}}>🏠 হোম</p>
          <p onClick={() => {setActiveTab('profile'); setIsDrawerOpen(false)}}>👤 প্রোফাইল</p>
          <p onClick={() => {setActiveTab('cart'); setIsDrawerOpen(false)}}>🛒 কার্ট</p>
          <p onClick={() => {setViewMode('adminLogin'); setIsDrawerOpen(false)}}>🛡️ অ্যাডমিন</p>
        </div>
      </div>

      <div className="main-content" style={{ paddingBottom: '70px', boxSizing: 'border-box', width: '100%' }}>
        
        {/* --- HOME TAB --- */}
        {activeTab === 'home' && (
          <div style={{padding: '10px'}}>
            <div className="search-container" style={{ margin: '10px 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
                <input type="text" placeholder="চাল, ডাল, তেল বা rice সার্চ করুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                style={{ width: '100%', padding: '12px 40px 12px 15px', borderRadius: '25px', border: '2px solid #27ae60', outline: 'none', color: '#000', boxSizing: 'border-box' }} />
                <span style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#27ae60', fontSize: '18px' }}>🔍</span>
              </div>
            </div> 

            <div className="product-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px'}}>
              {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase().trim())).map(p => {
                  const cItem = cart.find(x => x.id === p.id);
                  const { baseQty, text } = parseUnitStr(p.unit);
                  const currentPrice = cItem ? (p.price / baseQty) * cItem.qty : p.price; 
                  return (
                    <div key={p.id} className="p-card" style={{border: '1px solid #ddd', borderRadius: '10px', padding: '10px', textAlign: 'center', background: '#fff'}}>
                      <img src={p.image} alt={p.name} style={{width: '100%', height: '100px', objectFit: 'contain'}} />
                      <h4 style={{margin: '5px 0', fontSize: '14px', height: '40px', overflow: 'hidden'}}>{p.name}</h4>
                      <p style={{color: '#e74c3c', fontWeight: 'bold', margin: '5px 0'}}>৳{toBanglaNum(p.price)}/{p.unit}</p>
                      {cItem ? (
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px', background: '#e8f5e9', borderRadius: '8px'}}>
                          <button onClick={() => handleCart(p, 'remove')} style={{width: '30px', height: '30px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '5px'}}>-</button>
                          <span style={{fontWeight: 'bold', fontSize: '14px'}}>{toBanglaNum(cItem.qty)} {text}</span>
                          <button onClick={() => handleCart(p, 'add')} style={{width: '30px', height: '30px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '5px'}}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => handleCart(p, 'add')} style={{width: '100%', padding: '8px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '5px'}}>যোগ করুন</button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* --- CATEGORIES TAB --- */}
        {activeTab === 'categories' && (
           <div style={{padding: '20px', textAlign: 'center'}}>
             <h3 style={{color: '#27ae60'}}>ক্যাটাগরি পেজ শিঘ্রই আসছে!</h3>
           </div>
        )}

        {/* --- CART TAB --- */}
        {activeTab === 'cart' && (
          <div className="cart-view" style={{ padding: '15px', background: '#fdfdfd', minHeight: '80vh' }}>
            <h3 style={{ textAlign: 'center', color: '#27ae60', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>🛒 আপনার কার্ট ({cart.length})</h3>
            
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '50px', color: '#888' }}>
                <p>আপনার কার্ট খালি!</p>
                <button style={{background: '#27ae60', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px'}} onClick={() => setActiveTab('home')}>বাজার করতে যান</button>
              </div>
            ) : (
              <>
                {cart.map(item => {
                  const { baseQty, text } = parseUnitStr(item.unit);
                  const itemTotalPrice = (item.price / baseQty) * item.qty;
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px', borderRadius: '10px', marginBottom: '10px', border: '1px solid #ddd' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 'bold' }}>{item.name}</span>
                        <span style={{ fontSize: '12px', color: '#888', display: 'block' }}>{toBanglaNum(item.qty)} {text}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold' }}>৳{toBanglaNum(itemTotalPrice)}</span>
                      </div>
                    </div>
                  );
                })} 

                <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '12px', marginTop: '20px', border: '1px solid #c8e6c9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><span>পণ্যের দাম:</span><span>৳{toBanglaNum(totalCartPrice)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#666' }}><span>ডেলিভারি চার্জ:</span><span>৳{toBanglaNum(deliveryCharge)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', borderTop: '1px dashed #ccc', paddingTop: '10px' }}><span>সর্বমোট বিল:</span><span>৳{toBanglaNum(finalTotal)}</span></div>
                </div>

                <div className="checkout-form" style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ color: '#555' }}>🚚 ডেলিভারি তথ্য</h4>
                  <input placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({ ...userInfo, name: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  <input placeholder="মোবাইল নম্বর" type="number" value={userInfo.phone} onChange={e => setUserInfo({ ...userInfo, phone: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({ ...userInfo, district: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                    <input placeholder="থানা" value={userInfo.area} onChange={e => setUserInfo({ ...userInfo, area: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  </div>
                  <textarea placeholder="বিস্তারিত ঠিকানা" value={userInfo.address} onChange={e => setUserInfo({ ...userInfo, address: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', minHeight: '60px' }} /> 

                  <h4 style={{ color: '#555', marginTop: '10px' }}>💳 পেমেন্ট পদ্ধতি</h4>
                  <select value={userInfo.paymentMethod} onChange={e => setUserInfo({ ...userInfo, paymentMethod: e.target.value })} style={{ padding: '12px', borderRadius: '8px', border: '2px solid #27ae60', background: '#fff', color: '#000', width: '100%', fontSize: '16px', outline: 'none' }}>
                    <option value="Cash on Delivery">Cash on Delivery (নগদ টাকা)</option>
                    <option value="Bkash">বিকাশ (Bkash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                  </select> 

                  {(userInfo.paymentMethod === 'Bkash' || userInfo.paymentMethod === 'Nagad') && (
                    <div style={{ background: '#fff9c4', padding: '15px', borderRadius: '10px', border: '1px dashed #f39c12' }}>
                      <p style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#856404' }}>
                        আমাদের <b>{userInfo.paymentMethod}</b> পার্সনাল নম্বর: <b>০১৭২৩৫৩৯৭৩৮</b><br />
                        <b>৳{toBanglaNum(finalTotal)}</b> টাকা "Send Money" করে নিচের বক্সে তথ্য দিন:
                      </p>
                      <input placeholder="যে নম্বর থেকে টাকা পাঠিয়েছেন" type="number" value={userInfo.senderNumber || ''} onChange={e => setUserInfo({...userInfo, senderNumber: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd', marginBottom: '8px', boxSizing: 'border-box' }} />
                      <input placeholder="Transaction ID (TrxID)" value={userInfo.transactionId || ''} onChange={e => setUserInfo({...userInfo, transactionId: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
                    </div>
                  )} 

                  <button onClick={submitOrder} style={{ background: '#27ae60', color: '#fff', padding: '16px', fontSize: '18px', border: 'none', borderRadius: '8px', marginTop: '15px', fontWeight: 'bold' }}>
                    অর্ডার নিশ্চিত করুন (৳{toBanglaNum(finalTotal)})
                  </button> 
                </div>
              </>
            )}
          </div>
        )}

        {/* --- PROFILE TAB --- */}
        {activeTab === 'profile' && (
          <div className="profile-view" style={{ padding: '0 0 20px 0', background: '#f5f6f8', minHeight: '100vh' }}>
            {!user ? (
              <div style={{ padding: '20px', marginTop: '20px' }}>
                <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>লগইন করুন</h3>
                  <div id="recaptcha-container"></div> 
                  <input placeholder="মোবাইল নম্বর (যেমন: 017...)" type="number" onChange={e => setLoginPhone(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }} />
                  {!otpSent ? (
                    <button onClick={sendOtp} style={{ width: '100%', padding: '12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px' }}>OTP পাঠান</button>
                  ) : (
                    <>
                      <input placeholder="কোড দিন" type="number" onChange={e => setOtpCode(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }} />
                      <button onClick={verifyOtp} style={{ width: '100%', padding: '12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px' }}>ভেরিফাই করুন</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {/* --- Facebook Style Cover & Profile Pic Section --- */}
                <div style={{ position: 'relative', marginBottom: '60px', background: '#fff', paddingBottom: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                  
                  {/* Cover Photo Area */}
                  <div style={{ width: '100%', height: '180px', backgroundColor: '#cfd8dc', backgroundImage: `url(${userInfo.coverPhoto || 'https://via.placeholder.com/800x300?text=Cover+Photo'})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                     <label style={{ position: 'absolute', bottom: '10px', right: '15px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                       📷 কভার ফটো
                       <input type="file" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, 'coverPhoto')} accept="image/*" />
                     </label>
                  </div>

                  {/* Profile Picture Area */}
                  <div style={{ position: 'absolute', bottom: '-40px', left: '50%', transform: 'translateX(-50%)', width: '110px', height: '110px', borderRadius: '50%', border: '4px solid #fff', backgroundColor: '#eee', backgroundImage: `url(${userInfo.profilePic || 'https://via.placeholder.com/110?text=User'})`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                     <label style={{ position: 'absolute', bottom: '5px', right: '5px', background: '#e4e6eb', color: '#050505', padding: '6px', borderRadius: '50%', cursor: 'pointer', width: '25px', height: '25px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                       📷
                       <input type="file" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, 'profilePic')} accept="image/*" />
                     </label>
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '0 20px', marginBottom: '20px' }}>
                  <h2 style={{ margin: '0 0 5px 0', color: '#1c1e21', fontSize: '22px' }}>{userInfo?.name || 'আপনার নাম দিন'}</h2>
                  <p style={{ margin: '0', color: '#65676b', fontSize: '14px' }}>📞 {user.phone}</p>
                </div>

                <div style={{ padding: '0 20px' }}>
                  <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>📝 আপনার সেভ করা তথ্য:</h4>
                    <input placeholder="আপনার নাম" value={userInfo.name} onChange={e => setUserInfo({...userInfo, name: e.target.value})} style={{ width: '100%', padding: '12px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }} />
                    <input placeholder="জেলা" value={userInfo.district} onChange={e => setUserInfo({...userInfo, district: e.target.value})} style={{ width: '100%', padding: '12px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }} />
                    <input placeholder="থানা" value={userInfo.area} onChange={e => setUserInfo({...userInfo, area: e.target.value})} style={{ width: '100%', padding: '12px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }} />
                    <textarea placeholder="বিস্তারিত ঠিকানা" value={userInfo.address} onChange={e => setUserInfo({...userInfo, address: e.target.value})} style={{ width: '100%', padding: '12px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box' }} />
                    <button onClick={async () => { await setDoc(doc(db, "users", user.phone), { info: userInfo }, { merge: true }); alert('তথ্য সেভ হয়েছে!'); }} style={{ width: '100%', padding: '12px', background: '#1877f2', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>আপডেট করুন</button>
                  </div>

                  <h4 style={{ borderBottom: '2px solid #27ae60', display: 'inline-block', marginBottom: '10px' }}>আপনার অর্ডারসমূহ:</h4>
                  {userOrders && userOrders.length > 0 ? (
                    userOrders.map(o => (
                      <div key={o.id} className={`order-status ${getStatusColor(o.status)}`} style={{ background: '#fff', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #ddd' }}>
                         <strong>অর্ডার #{o.id.slice(-5).toUpperCase()}</strong> <span style={{fontSize: '12px', color: '#888', float: 'right'}}>{o.date}</span> <br/>
                         স্ট্যাটাস: <b style={{color: '#27ae60'}}>{o.status}</b> | মোট: ৳{toBanglaNum(o.total)}
                      </div>
                    ))
                  ) : (
                    <p style={{color: '#888'}}>এখনো কোনো অর্ডার করেননি।</p>
                  )}
                  
                  <button onClick={() => signOut(auth)} style={{ width: '100%', padding: '12px', background: '#e4e6eb', color: '#050505', border: 'none', borderRadius: '8px', fontWeight: 'bold', marginTop: '20px' }}>লগআউট করুন</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- Bottom Navigation --- */}
      <footer className="bottom-nav" style={{ position: 'fixed', bottom: 0, width: '100%', background: '#fff', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-around', padding: '10px 0', zIndex: 90 }}>
        <div style={{ textAlign: 'center', color: activeTab === 'home' ? '#27ae60' : '#888', cursor: 'pointer', flex: 1 }} onClick={() => setActiveTab('home')}><div style={{fontSize: '20px'}}>🏠</div><div style={{fontSize: '12px'}}>হোম</div></div>
        <div style={{ textAlign: 'center', color: activeTab === 'categories' ? '#27ae60' : '#888', cursor: 'pointer', flex: 1 }} onClick={() => setActiveTab('categories')}><div style={{fontSize: '20px'}}>🗂️</div><div style={{fontSize: '12px'}}>ক্যাটাগরি</div></div>
        <div style={{ textAlign: 'center', color: activeTab === 'cart' ? '#27ae60' : '#888', cursor: 'pointer', flex: 1, position: 'relative' }} onClick={() => setActiveTab('cart')}>
          <div style={{fontSize: '20px'}}>🛒</div><div style={{fontSize: '12px'}}>কার্ট</div>
          {cart.length > 0 && <span style={{position: 'absolute', top: '-5px', right: '15px', background: '#e74c3c', color: '#fff', borderRadius: '50%', padding: '2px 5px', fontSize: '10px'}}>{cart.length}</span>}
        </div>
        <div style={{ textAlign: 'center', color: activeTab === 'profile' ? '#27ae60' : '#888', cursor: 'pointer', flex: 1 }} onClick={() => setActiveTab('profile')}><div style={{fontSize: '20px'}}>👤</div><div style={{fontSize: '12px'}}>প্রোফাইল</div></div>
      </footer>
    </div>
  );
}

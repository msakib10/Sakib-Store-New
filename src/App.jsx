import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, addDoc, doc, 
  updateDoc, getDoc, setDoc, query, where, deleteDoc 
} from "firebase/firestore";
import { 
  getAuth, RecaptchaVerifier, signInWithPhoneNumber, 
  onAuthStateChanged, signOut 
} from "firebase/auth";
import './App.css';

// --- ফায়ারবেস কনফিগারেশন ---
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
const auth = getAuth(app);

// --- হেল্পার ফাংশনসমূহ ---

// ১. ইউনিট থেকে সংখ্যা এবং স্টেপ বের করার ফাংশন
const parseUnitStr = (unitStr) => {
  if (!unitStr) return { baseQty: 1, text: 'টি', step: 1 };
  const engStr = String(unitStr).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  const match = engStr.match(/^([\d.]+)\s*(.*)$/);
  
  if (match) {
    const num = parseFloat(match[1]) || 1;
    const txt = match[2] ? match[2].trim() : 'টি';
    let stepAmount = 1;
    
    // গ্রাম বা মিলি হলে ৫০ করে বাড়বে, কেজি/লিটার হলে ১ করে
    if (txt.includes('গ্রাম') || txt.includes('gm') || txt.includes('মিলি') || txt.includes('ml')) {
      stepAmount = num >= 100 ? 50 : 10;
    } else {
      stepAmount = 1; 
    }
    return { baseQty: num, text: txt, step: stepAmount };
  }
  return { baseQty: 1, text: unitStr, step: 1 };
};

// ২. ইংরেজি সংখ্যাকে বাংলায় রূপান্তর
const toBanglaNum = (num) => {
  if(!num && num !== 0) return '০';
  return Number(num).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
};

// ৩. এরিয়া ভিত্তিক ডেলিভারি চার্জ নির্ধারণ
const getDeliveryCharge = (area, district) => {
  const specialAreas = ['গোবিন্দল', 'সিংগাইর বাজার', 'পুকুরপাড়া', 'বকচর', 'নীলটেক'];
  if (specialAreas.some(a => area && area.includes(a))) return 20;
  if (district && district.includes('সিংগাইর')) return 30;
  return 100; // ডিফল্ট চার্জ
};

// ৪. স্ট্যাটাস অনুযায়ী কালার ক্লাস
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

export default function App() {
  // এখানে আপনার স্টেটগুলো শুরু হবে (ধাপ ২-এ দেওয়া হবে)

// --- ধাপ ২: App ফাংশনের ভেতরের স্টেট এবং লজিকসমূহ ---

export default function App() {
  // ১. সাধারণ স্টেটসমূহ
  const [activeTab, setActiveTab] = useState('home'); 
  const [viewMode, setViewMode] = useState('customer');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState('সব পণ্য');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [headerImage, setHeaderImage] = useState('https://via.placeholder.com/800x300');
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম!');

  // ২. প্রোডাক্ট এবং অর্ডার স্টেট
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [userOrders, setUserOrders] = useState([]);

  // ৩. ইউজার এবং অথেন্টিকেশন স্টেট
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState({ 
    name: '', phone: '', district: '', area: '', address: '', 
    paymentMethod: 'Cash on Delivery', senderNumber: '', transactionId: '' 
  });
  const [loginPhone, setLoginPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  // ৪. অ্যাডমিন প্যানেল স্টেট
  const [adminPass, setAdminPass] = useState('');
  const [adminTab, setAdminTab] = useState('orders');
  const [editId, setEditId] = useState(null);
  const [newP, setNewP] = useState({ 
    name: '', price: '', image: '', category: 'পাইকারি', 
    stock: 100, unit: '১কেজি', synonyms: '' 
  });

  // ৫. অ্যাপ আপডেট স্টেট
  const CURRENT_VERSION_CODE = 105;
  const [updateInfo, setUpdateInfo] = useState({ hasUpdate: false, url: '', version: '' });

  // --- ডাটা লোড করার useEffect ---
  useEffect(() => {
    fetchProducts();
    fetchNotice();
    fetchHeaderImage();
    checkUpdate();
    
    // ইউজার লগইন চেক
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

  const fetchNotice = async () => {
    const docSnap = await getDoc(doc(db, "settings", "notice"));
    if (docSnap.exists()) setScrollingNotice(docSnap.data().text);
  };

  const fetchHeaderImage = async () => {
    const docSnap = await getDoc(doc(db, "settings", "header"));
    if (docSnap.exists()) setHeaderImage(docSnap.data().url);
  };

  const checkUpdate = async () => {
    const docSnap = await getDoc(doc(db, "Latest", "version_info"));
    if (docSnap.exists() && docSnap.data().versionCode > CURRENT_VERSION_CODE) {
      setUpdateInfo({ hasUpdate: true, url: docSnap.data().downloadUrl, version: docSnap.data().versionName });
    }
  };

  const loadUserData = async (phone) => {
    const uSnap = await getDoc(doc(db, "users", phone));
    if (uSnap.exists()) setUserInfo(prev => ({ ...prev, ...uSnap.data().info }));
    const oSnap = await getDocs(query(collection(db, "orders"), where("userPhone", "==", phone)));
    setUserOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
  };

  // --- স্মার্ট কার্ট লজিক (যা আপনার দেওয়া ফিচারের উন্নত রূপ) ---
  const handleCart = (product, action) => {
    const { baseQty, step } = parseUnitStr(product.unit);
    
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id);
      if (action === 'add') {
        if (existing) {
          return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty + step } : item);
        } else {
          return [...prevCart, { ...product, qty: baseQty }];
        }
      } 
      if (action === 'remove' && existing) {
        if (existing.qty > baseQty) {
          return prevCart.map(item => item.id === product.id ? { ...item, qty: item.qty - step } : item);
        } else {
          return prevCart.filter(item => item.id !== product.id);
        }
      }
      return prevCart;
    });
  };

  // --- বিল ক্যালকুলেশন লজিক ---
  const totalCartPrice = cart.reduce((acc, item) => {
    const { baseQty } = parseUnitStr(item.unit);
    return acc + (item.price / baseQty) * item.qty;
  }, 0);

  const deliveryCharge = getDeliveryCharge(userInfo.area, userInfo.district);
  const finalTotal = totalCartPrice > 0 ? totalCartPrice + deliveryCharge : 0;

  // পরবর্তী ধাপে আমরা অথেন্টিকেশন, অর্ডার সাবমিশন এবং রেন্ডারিং লজিকগুলো দেখব


// --- ধাপ ৩: ফাংশনসমূহ এবং মূল UI (Return) ---

  // ১. অথেন্টিকেশন লজিক (OTP)
  const sendOTP = async () => {
    if (!loginPhone.startsWith('+88')) {
      alert("অনুগ্রহ করে +88 সহ নম্বর দিন (যেমন: +88017...)");
      return;
    }
    try {
      const captcha = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      const confirmation = await signInWithPhoneNumber(auth, loginPhone, captcha);
      setConfirmResult(confirmation);
      setOtpSent(true);
      alert("আপনার নম্বরে ওটিপি পাঠানো হয়েছে।");
    } catch (err) { alert("ওটিপি পাঠাতে ব্যর্থ: " + err.message); }
  };

  const verifyOTP = async () => {
    try {
      await confirmResult.confirm(otpCode);
      alert("লগইন সফল হয়েছে!");
    } catch (err) { alert("ভুল ওটিপি, আবার চেষ্টা করুন।"); }
  };

  // ২. অর্ডার সাবমিশন লজিক
  const submitOrder = async () => {
    if (!userInfo.name || !userInfo.phone || !userInfo.address) {
      alert("অনুগ্রহ করে আপনার নাম, ফোন এবং ঠিকানা সঠিকভাবে দিন।");
      return;
    }
    if (cart.length === 0) return alert("কার্ট খালি!");

    const orderData = {
      items: cart,
      totalPrice: totalCartPrice,
      deliveryCharge,
      finalTotal,
      userInfo,
      userPhone: user.phone,
      status: 'Pending',
      timestamp: serverTimestamp()
    };

    try {
      await addDoc(collection(db, "orders"), orderData);
      await setDoc(doc(db, "users", user.phone), { info: userInfo }, { merge: true });
      alert("অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে!");
      setCart([]);
      setActiveTab('orders');
    } catch (err) { alert("অর্ডার দিতে সমস্যা হয়েছে: " + err.message); }
  };

  // ৩. অ্যাডমিন প্যানেল ফাংশন (পণ্য যোগ/আপডেট)
  const saveProduct = async () => {
    if (!newP.name || !newP.price) return alert("নাম এবং দাম দিন");
    const pData = { ...newP, price: Number(newP.price), stock: Number(newP.stock) };
    if (editId) {
      await updateDoc(doc(db, "products", editId), pData);
      setEditId(null);
    } else {
      await addDoc(collection(db, "products"), pData);
    }
    setNewP({ name: '', price: '', image: '', category: 'পাইকারি', stock: 100, unit: '১কেজি', synonyms: '' });
    fetchProducts();
    alert("সফলভাবে সংরক্ষিত হয়েছে!");
  };

  // --- মূল UI রেন্ডারিং ---
  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      {/* হেডার এবং সার্চ বার */}
      <header className="sticky top-0 z-50 bg-green-600 p-3 shadow-md text-white">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <button onClick={() => setIsDrawerOpen(true)} className="p-2"><Menu size={24} /></button>
          <h1 className="text-xl font-bold italic tracking-wider">Sakib Store</h1>
          <div className="flex gap-4">
             <button onClick={() => setViewMode(viewMode === 'customer' ? 'admin' : 'customer')}>
               {viewMode === 'customer' ? <Settings size={22} /> : <User size={22} />}
             </button>
             <div className="relative">
                <ShoppingBag size={24} onClick={() => setActiveTab('cart')} />
                {cart.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-[10px] rounded-full px-1">{cart.length}</span>}
             </div>
          </div>
        </div>
        <div className="mt-3 max-w-4xl mx-auto">
          <div className="relative">
            <input 
              type="text" placeholder="পণ্য খুঁজুন (যেমন: আলু, পেঁয়াজ...)" 
              className="w-full p-2 pl-10 rounded-full text-black outline-none"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>
        </div>
      </header>

      {/* স্ক্রলিং নোটিশ */}
      <div className="bg-yellow-100 py-1 overflow-hidden border-b border-yellow-200">
        <div className="whitespace-nowrap animate-marquee text-sm font-medium text-red-600">
          {scrollingNotice}
        </div>
      </div>

      {/* কন্টেন্ট এরিয়া */}
      <main className="max-w-4xl mx-auto p-3">
        {activeTab === 'home' && (
          <>
            <img src={headerImage} alt="Cover" className="w-full h-40 object-cover rounded-xl mb-4 shadow-sm" />
            
            {/* ক্যাটাগরি ফিল্টার */}
            <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
              {['সব পণ্য', 'পাইকারি', 'খুচরা', 'মসলা', 'অন্যান্য'].map(cat => (
                <button 
                  key={cat} onClick={() => setSelectedCat(cat)}
                  className={`px-4 py-1.5 rounded-full whitespace-nowrap text-sm border ${selectedCat === cat ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* প্রোডাক্ট গ্রিড */}
            <div className="grid grid-cols-2 gap-3 mt-2">
              {products
                .filter(p => (selectedCat === 'সব পণ্য' || p.category === selectedCat) && (p.name.includes(searchTerm) || (p.synonyms && p.synonyms.includes(searchTerm))))
                .map(p => (
                <div key={p.id} className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                  <img src={p.image} className="w-full h-28 object-contain rounded-lg mb-2" alt={p.name} />
                  <div>
                    <h3 className="text-sm font-bold leading-tight">{p.name}</h3>
                    <p className="text-green-700 font-bold text-md mt-1">৳{p.price} <span className="text-[10px] text-gray-500 font-normal">/{p.unit}</span></p>
                  </div>
                  <div className="mt-2 flex items-center justify-between bg-gray-50 rounded-lg p-1">
                    <button onClick={() => handleCart(p, 'remove')} className="bg-red-100 p-1 rounded-md text-red-600"><Minus size={16}/></button>
                    <span className="font-bold text-sm">{cart.find(i => i.id === p.id)?.qty || 0}</span>
                    <button onClick={() => handleCart(p, 'add')} className="bg-green-100 p-1 rounded-md text-green-600"><Plus size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* অন্যান্য ট্যাব (Cart, Orders, Admin) এর কন্টেন্ট এখানে ধারাবাহিকভাবে বসবে... */}
      </main>

      {/* বটম নেভিগেশন */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-2 shadow-lg z-50">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center ${activeTab === 'home' ? 'text-green-600' : 'text-gray-400'}`}>
          <Home size={20} /><span className="text-[10px] mt-1">হোম</span>
        </button>
        <button onClick={() => setActiveTab('cart')} className={`flex flex-col items-center ${activeTab === 'cart' ? 'text-green-600' : 'text-gray-400'}`}>
          <ShoppingBag size={20} /><span className="text-[10px] mt-1">কার্ট</span>
        </button>
        <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center ${activeTab === 'orders' ? 'text-green-600' : 'text-gray-400'}`}>
          <ListOrdered size={20} /><span className="text-[10px] mt-1">অর্ডার</span>
        </button>
      </nav>

      {/* রিক্যাপচা কন্টেইনার */}
      <div id="recaptcha-container"></div>
    </div>
  );
}

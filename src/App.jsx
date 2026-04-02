import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, getDocs, addDoc, doc, updateDoc,
  getDoc, setDoc, query, where, deleteDoc
} from "firebase/firestore";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInAnonymously, onAuthStateChanged, signOut
} from "firebase/auth";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import './App.css';

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBSKT0kmhfyLHSur-Z8nnj3jrYn2KBcP0M",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b"
};
const firebaseApp = initializeApp(firebaseConfig);
const db      = getFirestore(firebaseApp);
const auth    = getAuth(firebaseApp);
const storage = getStorage(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseUnit = (u) => {
  if (!u) return { baseQty: 1, text: 'টি', step: 1 };
  const s = String(u).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  const m = s.match(/^([\d.]+)\s*(.*)$/);
  if (m) {
    const n = parseFloat(m[1]), t = m[2]?.trim() || 'টি';
    const step = (t.includes('গ্রাম')||t.includes('gm')||t.includes('মিলি')||t.includes('ml'))
      ? (n >= 100 ? 50 : 10) : 1;
    return { baseQty: n, text: t, step };
  }
  return { baseQty: 1, text: u, step: 1 };
};

const bn = (n) => {
  if (n == null) return '০';
  return Number(n).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
};

const DELIVERY_LOCS = [
  "গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া",
  "ঘোনাপাড়া","বকচর","সিংগাইর উপজেলার ভেতরে","নিজে লেখুন"
];
const deliveryCharge = (loc) => {
  if (["গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া","ঘোনাপাড়া","বকচর"].includes(loc)) return 20;
  if (loc === "সিংগাইর উপজেলার ভেতরে") return 40;
  return 50;
};
const stCls = (s) =>
  ({Pending:'st-pending',Confirmed:'st-confirmed','On Delivery':'st-delivery',
    Delivered:'st-delivered',Cancelled:'st-cancelled'}[s] || 'st-pending');

const CATS = ['সব পণ্য','পাইকারি','চাল','ডাল','তেল','মসলা','পানীয়','অন্যান্য'];

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {

  // core data
  const [products,       setProducts]       = useState([]);
  const [headerImg,      setHeaderImg]       = useState('https://placehold.co/820x312/1a7a43/ffffff?text=Sakib+Store');
  const [notice,         setNotice]          = useState('সাকিব স্টোরে আপনাকে স্বাগতম! 🌿 সেরা মানের পণ্য, সাশ্রয়ী মূল্যে।');
  // FIX: notification stored as object; show=true only when not expired
  const [notif,          setNotif]           = useState({ text: '', expiresAt: 0, show: false });
  const [showNotifModal, setShowNotifModal]  = useState(false);

  // nav
  const [tab,      setTab]      = useState('home');
  const [tabHist,  setTabHist]  = useState(['home']);
  const [mode,     setMode]     = useState('customer'); // customer | adminLogin | admin
  const [drawer,   setDrawer]   = useState(false);

  // home-page state
  const [homeCat,  setHomeCat]  = useState('সব পণ্য');
  // FIX: search term with direct controlled input
  const [search,   setSearch]   = useState('');
  const searchRef = useRef('');   // keep ref in sync for instant filtering

  // category tab
  const [catSel,   setCatSel]   = useState('সব পণ্য');

  // cart / user
  const [cart,       setCart]       = useState([]);
  const [user,       setUser]       = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [customLoc,  setCustomLoc]  = useState('');
  const [info,       setInfo]       = useState({
    name:'', phone:'', locationType:'গোবিন্দল', district:'মানিকগঞ্জ',
    area:'সিংগাইর', address:'', paymentMethod:'Cash on Delivery',
    senderNumber:'', transactionId:'', profilePic:'', coverPic:''
  });

  // admin
  const [adminPass,   setAdminPass]   = useState('');
  const [allOrders,   setAllOrders]   = useState([]);
  const [adminLoading,setAdminLoading]= useState(false);
  const [adminErr,    setAdminErr]    = useState('');
  const [adminFilter, setAdminFilter] = useState('All');
  const [adminTab,    setAdminTab]    = useState('orders');
  const [editId,      setEditId]      = useState(null);
  const [newP,        setNewP]        = useState({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});
  const [newNotif,    setNewNotif]    = useState({text:'',durationMins:60});

  // toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type='success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const backTime = useRef(0);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadProducts();
    loadSettings();

    const unsub = onAuthStateChanged(auth, cu => {
      if (cu) {
        setUser({ id: cu.uid, isAnon: cu.isAnonymous, email: cu.email });
        loadUserData(cu.uid);
      } else {
        setUser(null);
        try { const d = localStorage.getItem('guestInfo'); if (d) setInfo(JSON.parse(d)); } catch(_) {}
      }
    });

    window.history.pushState(null, null, window.location.pathname);
    const onPop = () => {
      window.history.pushState(null, null, window.location.pathname);
      if (drawer) { setDrawer(false); return; }
      setTabHist(prev => {
        if (prev.length > 1) {
          const n = [...prev]; n.pop(); setTab(n[n.length-1]); return n;
        }
        const now = Date.now();
        if (now - backTime.current < 2000) window.close();
        else { backTime.current = now; showToast('আবার Back চাপলে বের হবে','warning'); }
        return prev;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => { unsub(); window.removeEventListener('popstate', onPop); };
  // eslint-disable-next-line
  }, []);

  const goto = (t) => { setTab(t); setTabHist(p => [...p, t]); window.scrollTo(0,0); };

  // ── Firebase reads ────────────────────────────────────────────────────────
  const loadProducts = async () => {
    try {
      const s = await getDocs(collection(db,'products'));
      setProducts(s.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { console.error('loadProducts', e); }
  };

  const loadSettings = async () => {
    try {
      const s = await getDoc(doc(db,'settings','general'));
      if (s.exists()) {
        const d = s.data();
        if (d.header) setHeaderImg(d.header);
        if (d.notice) setNotice(d.notice);
        if (d.notification) {
          const expired = Date.now() > d.notification.expiresAt;
          setNotif({ ...d.notification, show: !expired });
        }
      }
    } catch(e) { console.error('loadSettings', e); }
  };

  const loadUserData = async (uid) => {
    try {
      const u = await getDoc(doc(db,'users',uid));
      if (u.exists() && u.data().info) setInfo(p => ({ ...p, ...u.data().info }));
      const o = await getDocs(query(collection(db,'orders'), where('userId','==',uid)));
      setUserOrders(o.docs.map(d => ({ id:d.id,...d.data() })).sort((a,b)=>b.timestamp-a.timestamp));
    } catch(e) { console.error('loadUserData', e); }
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  // FIX: signInWithPopup — no redirect, no localhost issue
  // Works on Spark plan for Google. If popup blocked → show instructions.
  const googleLogin = async () => {
    try {
      const r = await signInWithPopup(auth, googleProvider);
      if (r.user) { showToast('গুগল লগইন সফল! ✅'); goto('home'); }
    } catch(e) {
      if (e.code === 'auth/popup-blocked') {
        showToast('পপআপ ব্লক হয়েছে। Browser-এ popup allow করুন।','error');
      } else if (e.code === 'auth/cancelled-popup-request' || e.code === 'auth/popup-closed-by-user') {
        // user closed — do nothing
      } else {
        showToast('লগইন সমস্যা: '+ e.code,'error');
      }
    }
  };

  const guestLogin = async () => {
    try { await signInAnonymously(auth); showToast('গেস্ট হিসেবে প্রবেশ করেছেন!'); }
    catch(e) { showToast('সমস্যা: '+e.message,'error'); }
  };

  const logout = async () => {
    await signOut(auth);
    setInfo({name:'',phone:'',locationType:'গোবিন্দল',district:'মানিকগঞ্জ',area:'সিংগাইর',address:'',paymentMethod:'Cash on Delivery',senderNumber:'',transactionId:'',profilePic:'',coverPic:''});
    setCart([]); goto('home');
  };

  // ── Image Upload ──────────────────────────────────────────────────────────
  const uploadImg = async (e, type) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    showToast('ছবি আপলোড হচ্ছে...');
    const task = uploadBytesResumable(ref(storage,`users/${user.id}/${type}_${Date.now()}`), file);
    task.on('state_changed', null, err => showToast(err.message,'error'), async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      const upd = { ...info, [type]: url };
      setInfo(upd);
      await saveProfile(upd);
      showToast('ছবি আপডেট হয়েছে! ✅');
    });
  };

  const saveProfile = async (data = info) => {
    if (user && !user.isAnon) {
      await setDoc(doc(db,'users',user.id), { info: data }, { merge: true });
      showToast('প্রোফাইল আপডেট! ✅');
    } else {
      localStorage.setItem('guestInfo', JSON.stringify(data));
      showToast('তথ্য সাময়িকভাবে সেভ হয়েছে।');
    }
  };

  // ── Cart ──────────────────────────────────────────────────────────────────
  const cartAction = (product, action) => {
    // FIX: hard block on out-of-stock
    if (action === 'add' && product.stock <= 0) {
      showToast('এই পণ্যের স্টক শেষ!','error'); return;
    }
    const { baseQty, step } = parseUnit(product.unit);
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (action === 'add') {
        if (ex) {
          if ((ex.qty + step) > product.stock * baseQty) {
            showToast('স্টকের বেশি অর্ডার সম্ভব নয়!','error'); return prev;
          }
          return prev.map(i => i.id===product.id ? {...i, qty: i.qty+step} : i);
        }
        return [...prev, { ...product, qty: baseQty }];
      }
      if (action === 'remove' && ex) {
        if (ex.qty > baseQty) return prev.map(i => i.id===product.id ? {...i,qty:i.qty-step} : i);
        return prev.filter(i => i.id !== product.id);
      }
      return prev;
    });
  };

  const cartTotal   = cart.reduce((a,i) => a + (i.price/parseUnit(i.unit).baseQty)*i.qty, 0);
  const dc          = cart.length > 0 ? deliveryCharge(info.locationType) : 0;
  const finalTotal  = cartTotal + dc;

  const submitOrder = async () => {
    if (!info.name||!info.phone||!info.district||!info.area||!info.address)
      return showToast('ডেলিভারির সকল তথ্য দিন!','error');
    const loc = info.locationType==='নিজে লেখুন' ? customLoc : info.locationType;
    if (info.locationType==='নিজে লেখুন' && !customLoc) return showToast('জায়গার নাম লিখুন!','error');
    if ((info.paymentMethod==='Bkash'||info.paymentMethod==='Nogod') && (!info.senderNumber||!info.transactionId))
      return showToast('সেন্ডার নম্বর ও TrxID দিন!','error');
    try {
      await addDoc(collection(db,'orders'), {
        items: cart, userInfo: {...info, finalLocation: loc},
        userId: user?.id || 'Guest_'+Date.now(),
        paymentMethod: info.paymentMethod, total: finalTotal,
        status: 'Pending', date: new Date().toLocaleString('bn-BD'), timestamp: Date.now()
      });
      for (const item of cart) {
        const { baseQty } = parseUnit(item.unit);
        await updateDoc(doc(db,'products',item.id), { stock: Math.max(0, item.stock - item.qty/baseQty) });
      }
      if (user && !user.isAnon) await setDoc(doc(db,'users',user.id),{info},{merge:true});
      showToast('অর্ডার সফল! 🎉');
      setCart([]); loadProducts(); goto('profile');
      if (user) loadUserData(user.id);
    } catch(e) { showToast('সমস্যা: '+e.message,'error'); }
  };

  // ── Admin ─────────────────────────────────────────────────────────────────
  // FIX: admin fetch never causes blank screen — always catches errors
  const fetchOrders = async () => {
    setAdminLoading(true); setAdminErr(''); setAllOrders([]);
    try {
      // 8 second hard timeout
      const snap = await Promise.race([
        getDocs(collection(db,'orders')),
        new Promise((_,r) => setTimeout(() => r(new Error('TIMEOUT')), 8000))
      ]);
      setAllOrders(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.timestamp-a.timestamp));
    } catch(e) {
      const msg = e.message==='TIMEOUT'
        ? 'সংযোগ ধীর। ইন্টারনেট চেক করুন এবং আবার চেষ্টা করুন।'
        : 'Firestore সমস্যা: Security Rules চেক করুন।\n('+e.code+')';
      setAdminErr(msg);
    } finally { setAdminLoading(false); }
  };

  const saveProduct = async () => {
    if (!newP.name||!newP.price) return showToast('নাম ও দাম দিন!','error');
    try {
      if (editId) { await updateDoc(doc(db,'products',editId), newP); showToast('পণ্য আপডেট! ✅'); }
      else { await addDoc(collection(db,'products'), newP); showToast('পণ্য যোগ! ✅'); }
      setEditId(null);
      setNewP({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});
      loadProducts();
    } catch(e) { showToast(e.message,'error'); }
  };

  const sendNotif = async () => {
    if (!newNotif.text) return;
    const nd = { text: newNotif.text, expiresAt: Date.now() + newNotif.durationMins*60000 };
    await setDoc(doc(db,'settings','general'), { notification: nd }, { merge: true });
    setNotif({ ...nd, show: true });
    showToast('নোটিফিকেশন পাঠানো হয়েছে! ✅');
    setNewNotif({ text:'', durationMins:60 });
  };

  const saveSettings = async () => {
    await setDoc(doc(db,'settings','general'), { header: headerImg, notice }, { merge: true });
    showToast('সেটিংস সেভ! ✅');
  };

  // ── Filtered products (home) ───────────────────────────────────────────────
  const filtered = products.filter(p => {
    const catOk = homeCat==='সব পণ্য' || p.category===homeCat;
    const srchOk = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catOk && srchOk;
  });

  // ── Product card (reused) ─────────────────────────────────────────────────
  const PCard = ({ p, cols }) => {
    const ci = cart.find(x => x.id===p.id);
    const { baseQty } = parseUnit(p.unit);
    const price = ci ? (p.price/baseQty)*ci.qty : p.price;
    const out = p.stock <= 0;
    return (
      <div className={`product-card ${out?'out-of-stock':''}`}>
        <div className="p-img-box">
          <img src={p.image||'https://placehold.co/120x120/e8f5e9/27ae60?text=P'} alt={p.name}
            onError={e=>{e.target.src='https://placehold.co/120x120/e8f5e9/27ae60?text=P';}} />
        </div>
        {out && <div className="out-badge">স্টক শেষ</div>}
        <h4 className="p-name">{p.name}</h4>
        <p className="p-price">৳{bn(price)}</p>
        <p className="p-unit">{p.unit}</p>
        {!out && <p className="p-stock">স্টক: {bn(p.stock)}</p>}
        <div className="p-action">
          {out ? (
            <button className="btn-add disabled" disabled>স্টক নেই</button>
          ) : ci ? (
            <div className="qty-controls">
              <button className="btn-minus" onClick={()=>cartAction(p,'remove')}>-</button>
              <span className="qty-text">{bn(ci.qty)}</span>
              <button className="btn-plus" onClick={()=>cartAction(p,'add')}>+</button>
            </div>
          ) : (
            <button className="btn-add" onClick={()=>cartAction(p,'add')}>যোগ করুন</button>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN LOGIN
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'adminLogin') return (
    <div className="fullscreen-center">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <div className="admin-login-box">
        <div className="admin-logo">🛡️</div>
        <h2>অ্যাডমিন লগইন</h2>
        <input type="password" className="admin-input" placeholder="পাসওয়ার্ড দিন..."
          value={adminPass} onChange={e=>setAdminPass(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') doAdminLogin(); }} />
        <button className="btn-primary" onClick={doAdminLogin}>লগইন</button>
        <button className="btn-outline mt-10" onClick={()=>{setMode('customer');goto('home');}}>← ফিরে যান</button>
      </div>
    </div>
  );

  function doAdminLogin() {
    if (adminPass==='sakib123') { setMode('admin'); fetchOrders(); setAdminPass(''); }
    else showToast('ভুল পাসওয়ার্ড!','error');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN PANEL — FIX: always shows UI structure, never blank
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'admin') return (
    <div className="admin-wrapper">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <header className="admin-header">
        <button className="admin-back-btn" onClick={()=>{setMode('customer');goto('home');}}>← বের হোন</button>
        <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
        <span/>
      </header>

      <div className="admin-tabs">
        <button className={adminTab==='orders'?'active':''} onClick={()=>{setAdminTab('orders');fetchOrders();}}>
          📦 অর্ডারসমূহ
        </button>
        <button className={adminTab==='stock'?'active':''} onClick={()=>setAdminTab('stock')}>
          📊 স্টক ও সেটিংস
        </button>
      </div>

      <div className="admin-content">

        {/* ORDERS */}
        {adminTab==='orders' && (
          <>
            <div className="admin-orders-header">
              <h3 className="section-title">অর্ডার ম্যানেজমেন্ট</h3>
              <button className="btn-refresh" onClick={fetchOrders}>↻ রিফ্রেশ</button>
            </div>
            <div className="order-filters">
              {['All','Pending','Confirmed','On Delivery','Delivered','Cancelled'].map(s=>(
                <button key={s} className={adminFilter===s?'active':''} onClick={()=>setAdminFilter(s)}>{s}</button>
              ))}
            </div>

            {/* FIX: always render one of three states — never blank */}
            {adminLoading ? (
              <div className="admin-loading-box">
                <div className="admin-spinner"/>
                <p>লোড হচ্ছে...</p>
                <p className="text-sm text-muted" style={{marginTop:8}}>Firebase থেকে ডেটা আনা হচ্ছে</p>
              </div>
            ) : adminErr ? (
              <div className="admin-error-box">
                <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
                <p style={{whiteSpace:'pre-line'}}>{adminErr}</p>
                <button className="btn-primary mt-15" style={{width:'auto',padding:'10px 24px'}} onClick={fetchOrders}>
                  আবার চেষ্টা করুন
                </button>
                <p className="text-sm text-muted mt-10">
                  Firebase Console → Firestore → Rules-এ read অনুমতি আছে কিনা দেখুন।
                </p>
              </div>
            ) : allOrders.length===0 ? (
              <p className="empty-text">কোনো অর্ডার নেই।</p>
            ) : (
              <div className="orders-list">
                {allOrders.filter(o=>adminFilter==='All'||o.status===adminFilter).map(order=>(
                  <div key={order.id} className={`admin-order-card ${stCls(order.status)}`}>
                    <div className="o-header">
                      <strong>#{order.id.slice(-6).toUpperCase()}</strong>
                      <span className="o-date">{order.date}</span>
                    </div>
                    <p><b>নাম:</b> {order.userInfo?.name} | <b>মোবাইল:</b> {order.userInfo?.phone}</p>
                    <p><b>ঠিকানা:</b> {order.userInfo?.finalLocation}, {order.userInfo?.address}, {order.userInfo?.area}, {order.userInfo?.district}</p>
                    <p className="o-items-text"><b>পণ্য:</b> {order.items?.map(i=>`${i.name}(${i.qty}${parseUnit(i.unit).text})`).join(', ')}</p>
                    <p><b>পেমেন্ট:</b> <span className="highlight-text">{order.paymentMethod}</span> | <b>মোট:</b> ৳{order.total}</p>
                    {(order.paymentMethod==='Bkash'||order.paymentMethod==='Nogod')&&(
                      <p className="trx-box">TrxID: {order.userInfo?.transactionId} | Sender: {order.userInfo?.senderNumber}</p>
                    )}
                    <div className="status-updater">
                      <label>স্টেটাস:</label>
                      <select className={`status-select ${stCls(order.status)}`} value={order.status}
                        onChange={async e=>{
                          try { await updateDoc(doc(db,'orders',order.id),{status:e.target.value}); fetchOrders(); }
                          catch(err){ showToast('আপডেট সমস্যা: '+err.message,'error'); }
                        }}>
                        <option value="Pending">Pending ⏳</option>
                        <option value="Confirmed">Confirmed ✅</option>
                        <option value="On Delivery">On Delivery 🚚</option>
                        <option value="Delivered">Delivered 🏁</option>
                        <option value="Cancelled">Cancelled ❌</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* STOCK & SETTINGS */}
        {adminTab==='stock' && (
          <>
            <div className="admin-grid-layout">
              <div className="admin-col">
                <div className="admin-card">
                  <h4>🖼️ হেডার ছবি (URL)</h4>
                  <input type="text" placeholder="ছবির লিঙ্ক..." value={headerImg} onChange={e=>setHeaderImg(e.target.value)}/>
                  <h4 className="mt-15">📢 চলমান নোটিশ</h4>
                  <textarea placeholder="নোটিশ লিখুন..." value={notice} onChange={e=>setNotice(e.target.value)}/>
                  <button className="btn-primary mt-10" onClick={saveSettings}>সেভ করুন</button>
                </div>
                <div className="admin-card">
                  <h4>🔔 পুশ নোটিফিকেশন</h4>
                  <input type="text" placeholder="নোটিফিকেশন মেসেজ..." value={newNotif.text} onChange={e=>setNewNotif({...newNotif,text:e.target.value})}/>
                  <input type="number" className="mt-10" placeholder="কত মিনিট স্থায়ী?" value={newNotif.durationMins} onChange={e=>setNewNotif({...newNotif,durationMins:+e.target.value})}/>
                  <button className="btn-warning mt-10" onClick={sendNotif}>সেন্ড করুন</button>
                </div>
              </div>
              <div className="admin-col">
                <div className="admin-card">
                  <h3 className="text-green">{editId?"✏️ এডিট পণ্য":"➕ নতুন পণ্য"}</h3>
                  <input type="text" placeholder="পণ্যের নাম" className="mb-10" value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})}/>
                  <div className="flex-row gap-10 mb-10">
                    <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e=>setNewP({...newP,price:e.target.value})}/>
                    <input type="text" placeholder="পরিমাণ" value={newP.unit} onChange={e=>setNewP({...newP,unit:e.target.value})}/>
                  </div>
                  <div className="flex-row gap-10 mb-10">
                    <select value={newP.category} onChange={e=>setNewP({...newP,category:e.target.value})}>
                      {CATS.filter(c=>c!=='সব পণ্য').map(c=><option key={c}>{c}</option>)}
                    </select>
                    <input type="number" placeholder="স্টক" value={newP.stock} onChange={e=>setNewP({...newP,stock:+e.target.value})}/>
                  </div>
                  <input type="text" placeholder="ছবির URL" className="mb-10" value={newP.image} onChange={e=>setNewP({...newP,image:e.target.value})}/>
                  <div className="flex-row gap-10">
                    <button className="btn-primary flex-1" onClick={saveProduct}>{editId?"আপডেট":"যোগ করুন"}</button>
                    {editId&&<button className="btn-danger" onClick={()=>{setEditId(null);setNewP({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});}}>বাতিল</button>}
                  </div>
                </div>
              </div>
            </div>

            <h3 className="section-title mt-20">স্টক লিস্ট</h3>
            <div className="stock-list-grid">
              {products.map(p=>(
                <div key={p.id} className="stock-item-row">
                  <img src={p.image||'https://placehold.co/50x50/27ae60/fff?text=P'} alt={p.name}
                    onError={e=>{e.target.src='https://placehold.co/50x50/27ae60/fff?text=P';}}/>
                  <div className="si-details">
                    <strong>{p.name}</strong>
                    <p>৳{p.price}/{p.unit} | স্টক: <span style={{color:p.stock<=5?'#e74c3c':'inherit',fontWeight:700}}>{p.stock}</span></p>
                  </div>
                  <button className="btn-edit" onClick={()=>{setEditId(p.id);setNewP(p);window.scrollTo(0,0);}}>Edit</button>
                  <button className="btn-del" onClick={async()=>{if(window.confirm("ডিলিট করবেন?")){await deleteDoc(doc(db,'products',p.id));loadProducts();}}}>Del</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  // FIX: marquee shown everywhere but header only on home
  const isHome = tab === 'home';

  return (
    <div className="app-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Notification Modal — FIX: always shows on click */}
      {showNotifModal && (
        <div className="modal-bg" onClick={()=>setShowNotifModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 className="text-green mb-10">🔔 নোটিফিকেশন</h3>
            {notif.show && notif.text
              ? <p style={{lineHeight:1.6}}>{notif.text}</p>
              : <p className="text-muted">এই মুহূর্তে কোনো নোটিফিকেশন নেই।</p>
            }
            <button className="btn-primary mt-20" onClick={()=>setShowNotifModal(false)}>ঠিক আছে</button>
          </div>
        </div>
      )}

      {/* Drawer */}
      <div className={`drawer-overlay ${drawer?'active':''}`} onClick={()=>setDrawer(false)}/>
      <div className={`side-drawer ${drawer?'open':''}`}>
        <div className="drawer-head">
          <span>🌿 সাকিব স্টোর</span>
          <button className="drawer-close" onClick={()=>setDrawer(false)}>✕</button>
        </div>
        <ul className="drawer-menu">
          <li onClick={()=>{goto('home');setDrawer(false);}}>🏠 হোম</li>
          <li onClick={()=>{goto('profile');setDrawer(false);}}>👤 প্রোফাইল</li>
          <li onClick={()=>{window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html','_blank');setDrawer(false);}}>🚀 App Update</li>
          <li onClick={()=>{goto('about');setDrawer(false);}}>ℹ️ About Us</li>
          <li className="admin-menu-link" onClick={()=>{setMode('adminLogin');setDrawer(false);}}>🛡️ অ্যাডমিন প্যানেল</li>
        </ul>
      </div>

      {/* FIX: Header (with cover) only on home page */}
      {isHome ? (
        <header className="main-header" style={{backgroundImage:`url(${headerImg})`}}>
          <div className="header-overlay">
            <button className="icon-btn" onClick={()=>setDrawer(true)}>☰</button>
            <div className="header-title">সাকিব স্টোর</div>
            {/* FIX: Bell always clickable — shows notification or "no notification" */}
            <button className="icon-btn notif-btn" onClick={()=>setShowNotifModal(true)}>
              🔔{notif.show && <span className="notif-dot"/>}
            </button>
          </div>
        </header>
      ) : (
        // FIX: Other pages — compact header without cover image
        <header className="mini-header">
          <button className="icon-btn-dark" onClick={()=>setDrawer(true)}>☰</button>
          <div className="mini-header-title">সাকিব স্টোর</div>
          <button className="icon-btn-dark notif-btn" onClick={()=>setShowNotifModal(true)}>
            🔔{notif.show && <span className="notif-dot-dark"/>}
          </button>
        </header>
      )}

      {/* FIX: Marquee — below header on home, at top (after mini-header) on other pages */}
      <div className="marquee-wrapper">
        <div className="marquee-track">
          <span>📢 {notice}&nbsp;&nbsp;&nbsp;&nbsp;📢 {notice}</span>
        </div>
      </div>

      <main className="main-content">

        {/* ── HOME ─────────────────────────────────────────────────────── */}
        {tab==='home' && (
          <div className="page-home">
            {/* FIX: Search — controlled input with ref for instant response */}
            <div className="search-wrapper">
              <input
                type="text"
                placeholder="যে কোন কিছু সার্চ করুন..."
                value={search}
                onChange={e => {
                  searchRef.current = e.target.value;
                  setSearch(e.target.value);
                }}
              />
              <span className="search-icon">🔍</span>
              {search && (
                <button className="search-clear" onClick={()=>{setSearch('');searchRef.current='';}}>✕</button>
              )}
            </div>

            {/* Category pills — filter IN PLACE on home */}
            <div className="horizontal-categories">
              {CATS.map(c=>(
                <button key={c} className={`cat-pill ${homeCat===c?'active':''}`}
                  onClick={()=>{setHomeCat(c);setSearch('');searchRef.current='';}}>
                  {c}
                </button>
              ))}
            </div>

            {filtered.length===0 ? (
              <div className="empty-state text-center mt-30">
                <div className="empty-icon">🔍</div>
                <p>{search?`"${search}" পাওয়া যায়নি`:'এই ক্যাটাগরিতে পণ্য নেই'}</p>
                <button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}}
                  onClick={()=>{setHomeCat('সব পণ্য');setSearch('');searchRef.current='';}}>
                  সব পণ্য দেখুন
                </button>
              </div>
            ) : (
              <div className="product-grid-3">
                {filtered.map(p => <PCard key={p.id} p={p} cols={3}/>)}
              </div>
            )}
          </div>
        )}

        {/* ── CATEGORIES ───────────────────────────────────────────────── */}
        {tab==='categories' && (
          <div className="page-categories">
            <div className="cat-sidebar">
              {CATS.map(c=>(
                <div key={c} className={`cat-side-item ${catSel===c?'active':''}`} onClick={()=>setCatSel(c)}>{c}</div>
              ))}
            </div>
            <div className="cat-content">
              <h3 className="cat-title">{catSel}</h3>
              <div className="product-grid-2">
                {products.filter(p=>catSel==='সব পণ্য'||p.category===catSel)
                  .map(p=><PCard key={p.id} p={p} cols={2}/>)}
              </div>
            </div>
          </div>
        )}

        {/* ── CART ─────────────────────────────────────────────────────── */}
        {tab==='cart' && (
          <div className="page-cart">
            <h2 className="section-title text-center">আপনার কার্ট 🛒</h2>
            {cart.length===0 ? (
              <div className="empty-state text-center mt-30">
                <div className="empty-icon">🛒</div><p>কার্ট খালি!</p>
                <button className="btn-primary mt-10" onClick={()=>goto('home')}>পণ্য বাছাই করুন</button>
              </div>
            ) : (
              <div className="cart-checkout-wrapper">
                <div className="cart-items-list">
                  {cart.map(item=>(
                    <div key={item.id} className="cart-item">
                      <img src={item.image||'https://placehold.co/50x50/e8f5e9/27ae60?text=P'} alt={item.name} className="cart-item-img"/>
                      <div className="c-info">
                        <strong>{item.name}</strong>
                        <p className="text-muted">{bn(item.qty)}{parseUnit(item.unit).text}</p>
                      </div>
                      <div className="c-right">
                        <div className="c-price">৳{bn((item.price/parseUnit(item.unit).baseQty)*item.qty)}</div>
                        <div className="qty-controls small">
                          <button className="btn-minus" onClick={()=>cartAction(item,'remove')}>-</button>
                          <span className="qty-text">{bn(item.qty)}</span>
                          <button className="btn-plus" onClick={()=>cartAction(item,'add')}>+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="checkout-form mt-20">
                  <h3 className="sub-title">📍 কোথায় ডেলিভারি নিবেন?</h3>
                  <div className="selector-grid">
                    {DELIVERY_LOCS.map(loc=>(
                      <button key={loc} className={`select-box ${info.locationType===loc?'active':''}`}
                        onClick={()=>setInfo({...info,locationType:loc})}>
                        {loc}{loc!=='নিজে লেখুন'&&<span className="charge-hint">৳{deliveryCharge(loc)}</span>}
                      </button>
                    ))}
                  </div>
                  {info.locationType==='নিজে লেখুন'&&(
                    <input type="text" className="custom-input mt-10" placeholder="জায়গার নাম লিখুন..."
                      value={customLoc} onChange={e=>setCustomLoc(e.target.value)}/>
                  )}
                  <h3 className="sub-title mt-20">🚚 ডেলিভারি তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম *" value={info.name} onChange={e=>setInfo({...info,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর *" value={info.phone} onChange={e=>setInfo({...info,phone:e.target.value})}/>
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা *" value={info.district} onChange={e=>setInfo({...info,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা *" value={info.area} onChange={e=>setInfo({...info,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং *" value={info.address} onChange={e=>setInfo({...info,address:e.target.value})}/>
                  </div>
                  <h3 className="sub-title mt-20">💳 পেমেন্ট পদ্ধতি</h3>
                  <div className="selector-grid cols-3">
                    {['Bkash','Nogod','Cash on Delivery'].map(pm=>(
                      <button key={pm} className={`select-box payment-box ${info.paymentMethod===pm?'active':''}`}
                        onClick={()=>setInfo({...info,paymentMethod:pm})}>
                        {pm==='Bkash'?'💗 Bkash':pm==='Nogod'?'🔴 Nogod':'💵 CoD'}
                      </button>
                    ))}
                  </div>
                  {(info.paymentMethod==='Bkash'||info.paymentMethod==='Nogod')&&(
                    <div className="payment-instructions mt-10">
                      <p className="pay-number">📲 Personal: <strong>01723539738</strong></p>
                      <p className="text-muted text-sm mb-10">উপরের নম্বরে Send Money করুন:</p>
                      <input type="number" placeholder="যে নম্বর থেকে পাঠিয়েছেন *"
                        value={info.senderNumber} onChange={e=>setInfo({...info,senderNumber:e.target.value})} className="mb-10"/>
                      <input type="text" placeholder="Transaction ID *"
                        value={info.transactionId} onChange={e=>setInfo({...info,transactionId:e.target.value})}/>
                    </div>
                  )}
                  <div className="bill-summary mt-20">
                    <div className="bill-row"><span>পণ্যের দাম:</span><span>৳{bn(cartTotal)}</span></div>
                    <div className="bill-row"><span>ডেলিভারি:</span><span>৳{bn(dc)}</span></div>
                    <div className="bill-row total"><span>মোট বিল:</span><span>৳{bn(finalTotal)}</span></div>
                  </div>
                  <button className="btn-confirm-order mt-20" onClick={submitOrder}>
                    ✅ অর্ডার নিশ্চিত করুন (৳{bn(finalTotal)})
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE ──────────────────────────────────────────────────── */}
        {tab==='profile' && (
          <div className="page-profile">
            {!user ? (
              <div className="auth-screen text-center">
                <div className="auth-logo">🛒</div>
                <h2 className="mb-10">লগইন করুন</h2>
                <p className="text-muted mb-20">অর্ডার ট্র্যাক ও তথ্য সেভ করতে লগইন করুন।</p>
                {/* FIX: signInWithPopup — no redirect, no localhost problem */}
                <button className="btn-google mb-15" onClick={googleLogin}>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" width="20"/>
                  Google দিয়ে লগইন করুন
                </button>
                <div className="divider">অথবা</div>
                <button className="btn-outline mt-15" onClick={guestLogin}>👤 গেস্ট হিসেবে প্রবেশ করুন</button>
                <p className="text-muted mt-20 text-sm">Google লগইন করলে ডেটা চিরস্থায়ী থাকে।</p>
              </div>
            ) : (
              <div className="profile-dashboard">
                <div className="profile-header-box">
                  <div className="cover-photo" style={{backgroundImage:`url(${info.coverPic||'https://placehold.co/400x150/27ae60/fff?text=Cover'})`}}>
                    <label className="upload-btn cover-upload">📷 কভার পরিবর্তন
                      <input type="file" hidden accept="image/*" onChange={e=>uploadImg(e,'coverPic')}/>
                    </label>
                  </div>
                  <div className="avatar-section">
                    <div className="avatar" style={{backgroundImage:`url(${info.profilePic||'https://placehold.co/100x100/27ae60/fff?text=U'})`}}>
                      <label className="upload-btn avatar-upload">📷
                        <input type="file" hidden accept="image/*" onChange={e=>uploadImg(e,'profilePic')}/>
                      </label>
                    </div>
                    <div className="user-titles">
                      <h3>{info.name||(user.isAnon?'গেস্ট ইউজার':'নাম দিন')}</h3>
                      <p>{user.email||(user.isAnon?'Guest Account':'')}</p>
                    </div>
                  </div>
                </div>
                <div className="profile-edit-card mt-20">
                  <h3 className="sub-title">✏️ আপনার তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম" value={info.name} onChange={e=>setInfo({...info,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর" value={info.phone} onChange={e=>setInfo({...info,phone:e.target.value})}/>
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা" value={info.district} onChange={e=>setInfo({...info,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা" value={info.area} onChange={e=>setInfo({...info,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={info.address} onChange={e=>setInfo({...info,address:e.target.value})}/>
                    <button className="btn-primary mt-10" onClick={()=>saveProfile()}>💾 তথ্য সেভ করুন</button>
                  </div>
                </div>
                <div className="order-history mt-20">
                  <h3 className="sub-title">📦 আপনার অর্ডার ({userOrders.length})</h3>
                  {userOrders.length===0?<p className="text-muted">কোনো অর্ডার নেই।</p>:(
                    userOrders.map(o=>(
                      <div key={o.id} className={`history-card ${stCls(o.status)}`}>
                        <div className="hc-head">
                          <strong>Order #{o.id.slice(-6).toUpperCase()}</strong>
                          <span className={`badge-status ${stCls(o.status)}`}>{o.status}</span>
                        </div>
                        <p className="text-sm text-muted">{o.date}</p>
                        <p className="mt-5"><b>পণ্য:</b> {o.items?.map(i=>`${i.name}(${i.qty})`).join(', ')}</p>
                        <p><b>মোট:</b> ৳{bn(o.total)}</p>
                      </div>
                    ))
                  )}
                </div>
                <button className="btn-danger w-full mt-20" onClick={logout}>🚪 লগ আউট করুন</button>
              </div>
            )}
          </div>
        )}

        {/* ── ABOUT ────────────────────────────────────────────────────── */}
        {tab==='about' && (
          <div className="about-view">
            <h2 className="text-green mb-20">About Us</h2>
            <div className="about-logo">🌿</div>
            <h3 className="mb-10">সাকিব স্টোর</h3>
            <p className="about-desc">সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            <div className="contact-box mt-30">
              <p className="contact-title">📞 যোগাযোগ:</p>
              <p>০১৭২৪৪০৯২১৯</p><p>০১৭৩৫৩৭৬০৭৯</p><p>০১৭২৩৫৩৯৭৩৮</p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <footer className="bottom-nav">
        <div className={`nav-icon ${tab==='home'?'active':''}`} onClick={()=>goto('home')}><span>🏠</span><span>হোম</span></div>
        <div className={`nav-icon ${tab==='categories'?'active':''}`} onClick={()=>goto('categories')}><span>🗂️</span><span>ক্যাটাগরি</span></div>
        <div className={`nav-icon cart-nav ${tab==='cart'?'active':''}`} onClick={()=>goto('cart')}>
          <span>🛒</span><span>কার্ট</span>
          {cart.length>0&&<span className="nav-badge">{bn(cart.length)}</span>}
        </div>
        <div className={`nav-icon ${tab==='profile'?'active':''}`} onClick={()=>goto('profile')}><span>👤</span><span>প্রোফাইল</span></div>
      </footer>
    </div>
  );
}

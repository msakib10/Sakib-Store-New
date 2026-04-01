import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, getDocs, addDoc, doc, updateDoc,
  getDoc, setDoc, query, where, deleteDoc
} from "firebase/firestore";
import {
  getAuth, GoogleAuthProvider, signInWithRedirect,
  getRedirectResult, signInAnonymously, onAuthStateChanged, signOut
} from "firebase/auth";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import './App.css';

const firebaseConfig = {
  apiKey: "AIzaSyBSKT0kmhfyLHSur-Z8nnj3jrYn2KBcP0M",
  authDomain: "sakib-store1.firebaseapp.com",
  projectId: "sakib-store1",
  storageBucket: "sakib-store1.firebasestorage.app",
  messagingSenderId: "514373347826",
  appId: "1:514373347826:web:a778be5386cd5362d1636b"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const storage = getStorage(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const parseUnitStr = (unitStr) => {
  if (!unitStr) return { baseQty: 1, text: 'টি', step: 1 };
  const engStr = String(unitStr).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  const match = engStr.match(/^([\d.]+)\s*(.*)$/);
  if (match) {
    const num = parseFloat(match[1]);
    const txt = match[2] ? match[2].trim() : 'টি';
    let step = 1;
    if (txt.includes('গ্রাম')||txt.includes('gm')||txt.includes('মিলি')||txt.includes('ml'))
      step = num >= 100 ? 50 : 10;
    return { baseQty: num, text: txt, step };
  }
  return { baseQty: 1, text: unitStr, step: 1 };
};

const toBanglaNum = (num) => {
  if (!num && num !== 0) return '০';
  return Number(num).toFixed(0).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
};

const deliveryLocations = ["গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া","ঘোনাপাড়া","বকচর","সিংগাইর উপজেলার ভেতরে","নিজে লেখুন"];
const getDeliveryCharge = (loc) => {
  if (["গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া","ঘোনাপাড়া","বকচর"].includes(loc)) return 20;
  if (loc === "সিংগাইর উপজেলার ভেতরে") return 40;
  return 50;
};
const getStatusClass = (s) =>
  ({Pending:'st-pending',Confirmed:'st-confirmed','On Delivery':'st-delivery',Delivered:'st-delivered',Cancelled:'st-cancelled'}[s]||'st-pending');

export default function App() {
  const cats = ['সব পণ্য','পাইকারি','চাল','ডাল','তেল','মসলা','পানীয়','অন্যান্য'];

  const [products, setProducts] = useState([]);
  const [headerImage, setHeaderImage] = useState('https://placehold.co/820x312/1a7a43/ffffff?text=Sakib+Store');
  const [scrollingNotice, setScrollingNotice] = useState('সাকিব স্টোরে আপনাকে স্বাগতম! 🌿 সেরা মানের পণ্য, সাশ্রয়ী মূল্যে।');
  const [notification, setNotification] = useState({ text:'', expiresAt:0, show:false });
  const [showNotifModal, setShowNotifModal] = useState(false);

  const [activeTab, setActiveTab] = useState('home');
  const [tabHistory, setTabHistory] = useState(['home']);
  const [viewMode, setViewMode] = useState('customer');

  // FIX 3: home category = filter in place; category tab = separate
  const [homeCat, setHomeCat] = useState('সব পণ্য');
  const [catTabSel, setCatTabSel] = useState('সব পণ্য');

  // FIX 4: search
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [adminTab, setAdminTab] = useState('orders');
  const [adminFilter, setAdminFilter] = useState('All');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');

  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [userOrders, setUserOrders] = useState([]);
  const [customLoc, setCustomLoc] = useState('');
  const [userInfo, setUserInfo] = useState({
    name:'',phone:'',locationType:'গোবিন্দল',district:'মানিকগঞ্জ',
    area:'সিংগাইর',address:'',paymentMethod:'Cash on Delivery',
    senderNumber:'',transactionId:'',profilePic:'',coverPic:''
  });

  const [adminPass, setAdminPass] = useState('');
  const [allOrders, setAllOrders] = useState([]);
  const [editId, setEditId] = useState(null);
  const [newP, setNewP] = useState({ name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি' });
  const [newNotif, setNewNotif] = useState({ text:'',durationMins:60 });

  const [toast, setToast] = useState(null);
  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const backPressTime = useRef(0);

  useEffect(() => {
    fetchProducts();
    fetchSettings();

    // FIX 2: handle Google redirect result
    getRedirectResult(auth).then(r => {
      if (r?.user) {
        const u = r.user;
        setUser({id:u.uid,isAnonymous:u.isAnonymous,email:u.email});
        loadUserData(u.uid);
        showToast('গুগল লগইন সফল! ✅');
      }
    }).catch(e => console.error('redirect:', e));

    const unsub = onAuthStateChanged(auth, cu => {
      if (cu) {
        setUser({id:cu.uid,isAnonymous:cu.isAnonymous,email:cu.email});
        loadUserData(cu.uid);
      } else {
        setUser(null);
        try { const l=localStorage.getItem('tempUserInfo'); if(l) setUserInfo(JSON.parse(l)); } catch(_){}
      }
    });

    window.history.pushState(null,null,window.location.pathname);
    const handlePop = () => {
      window.history.pushState(null,null,window.location.pathname);
      if (isDrawerOpen) { setIsDrawerOpen(false); return; }
      setTabHistory(prev => {
        if (prev.length > 1) { const n=[...prev]; n.pop(); setActiveTab(n[n.length-1]); return n; }
        const now=Date.now();
        if (now-backPressTime.current<2000) window.close();
        else { backPressTime.current=now; showToast('আবার Back চাপলে বের হবে','warning'); }
        return prev;
      });
    };
    window.addEventListener('popstate', handlePop);
    return () => { unsub(); window.removeEventListener('popstate', handlePop); };
  // eslint-disable-next-line
  }, []);

  const changeTab = (t) => { setActiveTab(t); setTabHistory(p=>[...p,t]); window.scrollTo(0,0); };

  const fetchProducts = async () => {
    try { const s=await getDocs(collection(db,"products")); setProducts(s.docs.map(d=>({id:d.id,...d.data()}))); }
    catch(e) { console.error("fetchProducts:",e); }
  };

  const fetchSettings = async () => {
    try {
      const s=await getDoc(doc(db,"settings","general"));
      if (s.exists()) {
        const d=s.data();
        if(d.header) setHeaderImage(d.header);
        if(d.notice) setScrollingNotice(d.notice);
        if(d.notification) setNotification({...d.notification,show:Date.now()<=d.notification.expiresAt});
      }
    } catch(e) { console.error("fetchSettings:",e); }
  };

  const loadUserData = async (uid) => {
    try {
      const u=await getDoc(doc(db,"users",uid));
      if(u.exists()&&u.data().info) setUserInfo(p=>({...p,...u.data().info}));
      const o=await getDocs(query(collection(db,"orders"),where("userId","==",uid)));
      setUserOrders(o.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.timestamp-a.timestamp));
    } catch(e) { console.error("loadUserData:",e); }
  };

  // FIX 2: signInWithRedirect — no billing required, works on mobile
  const handleGoogleLogin = async () => {
    try { showToast('Google লগইনে যাচ্ছেন...','warning'); await signInWithRedirect(auth,googleProvider); }
    catch(e) { showToast('লগইন সমস্যা: '+e.message,'error'); }
  };

  const handleGuestLogin = async () => {
    try { await signInAnonymously(auth); showToast('গেস্ট হিসেবে প্রবেশ করেছেন!'); }
    catch(e) { showToast('সমস্যা: '+e.message,'error'); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserInfo({name:'',phone:'',locationType:'গোবিন্দল',district:'মানিকগঞ্জ',area:'সিংগাইর',address:'',paymentMethod:'Cash on Delivery',senderNumber:'',transactionId:'',profilePic:'',coverPic:''});
    setCart([]); changeTab('home');
  };

  const handleImageUpload = async (e, type) => {
    const file=e.target.files[0]; if(!file||!user) return;
    showToast('ছবি আপলোড হচ্ছে...');
    const task=uploadBytesResumable(ref(storage,`users/${user.id}/${type}_${Date.now()}`),file);
    task.on('state_changed',null,err=>showToast(err.message,'error'),async()=>{
      const url=await getDownloadURL(task.snapshot.ref);
      const upd={...userInfo,[type]:url}; setUserInfo(upd); await saveProfileData(upd);
      showToast('ছবি আপডেট হয়েছে! ✅');
    });
  };

  const saveProfileData = async (data=userInfo) => {
    if(user) { await setDoc(doc(db,"users",user.id),{info:data},{merge:true}); showToast('প্রোফাইল আপডেট! ✅'); }
    else { localStorage.setItem('tempUserInfo',JSON.stringify(data)); showToast('তথ্য সাময়িকভাবে সেভ হয়েছে।'); }
  };

  const handleCart = (product, action) => {
    const {baseQty,step}=parseUnitStr(product.unit);
    setCart(prev=>{
      const ex=prev.find(i=>i.id===product.id);
      if(action==='add'){
        if(product.stock<=0){showToast('স্টকে নেই!','error');return prev;}
        if(ex){
          if((ex.qty+step)>product.stock*baseQty) return prev;
          return prev.map(i=>i.id===product.id?{...i,qty:i.qty+step}:i);
        }
        return [...prev,{...product,qty:baseQty}];
      }
      if(action==='remove'&&ex){
        if(ex.qty>baseQty) return prev.map(i=>i.id===product.id?{...i,qty:i.qty-step}:i);
        return prev.filter(i=>i.id!==product.id);
      }
      return prev;
    });
  };

  const totalCartPrice=cart.reduce((a,i)=>a+(i.price/parseUnitStr(i.unit).baseQty)*i.qty,0);
  const deliveryCharge=cart.length>0?getDeliveryCharge(userInfo.locationType):0;
  const finalTotal=totalCartPrice+deliveryCharge;

  const submitOrder = async () => {
    if(!userInfo.name||!userInfo.phone||!userInfo.district||!userInfo.area||!userInfo.address)
      return showToast('ডেলিভারির সকল তথ্য দিন!','error');
    const finalLoc=userInfo.locationType==='নিজে লেখুন'?customLoc:userInfo.locationType;
    if(userInfo.locationType==='নিজে লেখুন'&&!customLoc) return showToast('জায়গার নাম লিখুন!','error');
    if((userInfo.paymentMethod==='Bkash'||userInfo.paymentMethod==='Nogod')&&(!userInfo.senderNumber||!userInfo.transactionId))
      return showToast('সেন্ডার নম্বর ও TrxID দিন!','error');
    try {
      await addDoc(collection(db,"orders"),{
        items:cart,userInfo:{...userInfo,finalLocation:finalLoc},
        userId:user?.id||'Guest_'+Date.now(),paymentMethod:userInfo.paymentMethod,
        total:finalTotal,status:'Pending',date:new Date().toLocaleString('bn-BD'),timestamp:Date.now()
      });
      for(const item of cart){
        const{baseQty}=parseUnitStr(item.unit);
        await updateDoc(doc(db,"products",item.id),{stock:Math.max(0,item.stock-item.qty/baseQty)});
      }
      if(user) await setDoc(doc(db,"users",user.id),{info:userInfo},{merge:true});
      showToast('অর্ডার সফল! 🎉'); setCart([]); fetchProducts(); changeTab('profile');
      if(user) loadUserData(user.id);
    } catch(e){showToast('সমস্যা: '+e.message,'error');}
  };

  // FIX 1: Admin fetch with 10s timeout — prevents permanent white screen
  const fetchAllOrders = async () => {
    setIsAdminLoading(true); setAdminError(''); setAllOrders([]);
    try {
      const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),10000));
      const snap=await Promise.race([getDocs(collection(db,"orders")),timeout]);
      setAllOrders(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.timestamp-a.timestamp));
    } catch(e) {
      const msg=e.message==='timeout'?'সংযোগ সমস্যা। আবার চেষ্টা করুন।':'ডেটা লোড সমস্যা: '+e.message;
      setAdminError(msg); showToast(msg,'error');
    } finally { setIsAdminLoading(false); }
  };

  const saveProduct = async () => {
    if(!newP.name||!newP.price) return showToast('নাম ও দাম দিন!','error');
    try {
      if(editId){await updateDoc(doc(db,"products",editId),newP);showToast('আপডেট! ✅');}
      else{await addDoc(collection(db,"products"),newP);showToast('পণ্য যোগ! ✅');}
      setEditId(null); setNewP({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});
      fetchProducts();
    } catch(e){showToast(e.message,'error');}
  };

  const pushNotification = async () => {
    if(!newNotif.text) return;
    const exp=Date.now()+newNotif.durationMins*60000;
    const nd={text:newNotif.text,expiresAt:exp};
    await setDoc(doc(db,"settings","general"),{notification:nd},{merge:true});
    setNotification({...nd,show:true}); showToast('নোটিফিকেশন পাঠানো হয়েছে! ✅');
  };

  const saveGeneralSettings = async () => {
    await setDoc(doc(db,"settings","general"),{header:headerImage,notice:scrollingNotice},{merge:true});
    showToast('সেটিংস সেভ! ✅');
  };

  // FIX 3 + 4: filtered products for home (no tab change)
  const homeProducts = products.filter(p => {
    const c = homeCat === 'সব পণ্য' || p.category === homeCat;
    const s = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return c && s;
  });

  // ====== ADMIN LOGIN ======
  if (viewMode === 'adminLogin') return (
    <div className="fullscreen-center">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <div className="admin-login-box">
        <div className="admin-logo">🛡️</div>
        <h2>অ্যাডমিন লগইন</h2>
        <input type="password" className="admin-input" placeholder="পাসওয়ার্ড দিন..."
          value={adminPass} onChange={e=>setAdminPass(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){if(adminPass==='sakib123'){setViewMode('admin');fetchAllOrders();setAdminPass('');}else showToast('ভুল পাসওয়ার্ড!','error');}}}
        />
        <button className="btn-primary" onClick={()=>{if(adminPass==='sakib123'){setViewMode('admin');fetchAllOrders();setAdminPass('');}else showToast('ভুল পাসওয়ার্ড!','error');}}>লগইন</button>
        <button className="btn-outline mt-10" onClick={()=>{setViewMode('customer');changeTab('home');}}>← ফিরে যান</button>
      </div>
    </div>
  );

  // ====== ADMIN PANEL — FIX 1: always visible, never blank ======
  if (viewMode === 'admin') return (
    <div className="admin-wrapper">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <header className="admin-header">
        <button className="admin-back-btn" onClick={()=>{setViewMode('customer');changeTab('home');}}>← বের হোন</button>
        <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
        <span/>
      </header>
      <div className="admin-tabs">
        <button className={adminTab==='orders'?'active':''} onClick={()=>{setAdminTab('orders');fetchAllOrders();}}>📦 অর্ডারসমূহ</button>
        <button className={adminTab==='stock'?'active':''} onClick={()=>setAdminTab('stock')}>📊 স্টক ও সেটিংস</button>
      </div>
      <div className="admin-content">
        {adminTab==='orders' && (
          <>
            <h3 className="section-title">অর্ডার ম্যানেজমেন্ট</h3>
            <div className="order-filters">
              {['All','Pending','Confirmed','On Delivery','Delivered','Cancelled'].map(s=>(
                <button key={s} className={adminFilter===s?'active':''} onClick={()=>setAdminFilter(s)}>{s}</button>
              ))}
            </div>
            {isAdminLoading ? (
              <div className="admin-loading-box">
                <div className="admin-spinner"/>
                <p>অর্ডার লোড হচ্ছে...</p>
              </div>
            ) : adminError ? (
              <div className="admin-error-box">
                <p>⚠️ {adminError}</p>
                <button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}} onClick={fetchAllOrders}>আবার চেষ্টা করুন</button>
              </div>
            ) : (
              <div className="orders-list">
                {allOrders.filter(o=>adminFilter==='All'||o.status===adminFilter).length===0
                  ? <p className="empty-text">কোনো অর্ডার নেই।</p>
                  : allOrders.filter(o=>adminFilter==='All'||o.status===adminFilter).map(order=>(
                    <div key={order.id} className={`admin-order-card ${getStatusClass(order.status)}`}>
                      <div className="o-header">
                        <strong>#{order.id.slice(-6).toUpperCase()}</strong>
                        <span className="o-date">{order.date}</span>
                      </div>
                      <p><b>নাম:</b> {order.userInfo?.name} | <b>মোবাইল:</b> {order.userInfo?.phone}</p>
                      <p><b>ঠিকানা:</b> {order.userInfo?.finalLocation}, {order.userInfo?.address}, {order.userInfo?.area}, {order.userInfo?.district}</p>
                      <p className="o-items-text"><b>পণ্য:</b> {order.items?.map(i=>`${i.name} (${i.qty}${parseUnitStr(i.unit).text})`).join(', ')}</p>
                      <p><b>পেমেন্ট:</b> <span className="highlight-text">{order.paymentMethod}</span> | <b>মোট:</b> ৳{order.total}</p>
                      {(order.paymentMethod==='Bkash'||order.paymentMethod==='Nogod') && (
                        <p className="trx-box">TrxID: {order.userInfo?.transactionId} | Sender: {order.userInfo?.senderNumber}</p>
                      )}
                      <div className="status-updater">
                        <label>স্টেটাস:</label>
                        <select className={`status-select ${getStatusClass(order.status)}`} value={order.status}
                          onChange={async e=>{await updateDoc(doc(db,"orders",order.id),{status:e.target.value});fetchAllOrders();}}>
                          <option value="Pending">Pending ⏳</option>
                          <option value="Confirmed">Confirmed ✅</option>
                          <option value="On Delivery">On Delivery 🚚</option>
                          <option value="Delivered">Delivered 🏁</option>
                          <option value="Cancelled">Cancelled ❌</option>
                        </select>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </>
        )}
        {adminTab==='stock' && (
          <>
            <div className="admin-grid-layout">
              <div className="admin-col">
                <div className="admin-card">
                  <h4>🖼️ হেডার ছবি (URL)</h4>
                  <input type="text" placeholder="ছবির লিঙ্ক..." value={headerImage} onChange={e=>setHeaderImage(e.target.value)}/>
                  <h4 className="mt-15">📢 চলমান নোটিশ</h4>
                  <textarea placeholder="নোটিশ লিখুন..." value={scrollingNotice} onChange={e=>setScrollingNotice(e.target.value)}/>
                  <button className="btn-primary mt-10" onClick={saveGeneralSettings}>সেভ করুন</button>
                </div>
                <div className="admin-card">
                  <h4>🔔 পুশ নোটিফিকেশন</h4>
                  <input type="text" placeholder="নোটিফিকেশন মেসেজ..." value={newNotif.text} onChange={e=>setNewNotif({...newNotif,text:e.target.value})}/>
                  <input type="number" className="mt-10" placeholder="কত মিনিট স্থায়ী হবে?" value={newNotif.durationMins} onChange={e=>setNewNotif({...newNotif,durationMins:+e.target.value})}/>
                  <button className="btn-warning mt-10" onClick={pushNotification}>সেন্ড করুন</button>
                </div>
              </div>
              <div className="admin-col">
                <div className="admin-card">
                  <h3 className="text-green">{editId?"✏️ এডিট পণ্য":"➕ নতুন পণ্য"}</h3>
                  <input type="text" placeholder="পণ্যের নাম" className="mb-10" value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})}/>
                  <div className="flex-row gap-10 mb-10">
                    <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e=>setNewP({...newP,price:e.target.value})}/>
                    <input type="text" placeholder="পরিমাণ (১ কেজি...)" value={newP.unit} onChange={e=>setNewP({...newP,unit:e.target.value})}/>
                  </div>
                  <div className="flex-row gap-10 mb-10">
                    <select value={newP.category} onChange={e=>setNewP({...newP,category:e.target.value})}>
                      {cats.filter(c=>c!=='সব পণ্য').map(c=><option key={c}>{c}</option>)}
                    </select>
                    <input type="number" placeholder="স্টক" value={newP.stock} onChange={e=>setNewP({...newP,stock:+e.target.value})}/>
                  </div>
                  <input type="text" placeholder="ছবির লিংক (URL)" className="mb-10" value={newP.image} onChange={e=>setNewP({...newP,image:e.target.value})}/>
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
                  <img src={p.image||'https://placehold.co/50x50/27ae60/fff?text=P'} alt={p.name}/>
                  <div className="si-details"><strong>{p.name}</strong><p>৳{p.price}/{p.unit} | স্টক:{p.stock}</p></div>
                  <button className="btn-edit" onClick={()=>{setEditId(p.id);setNewP(p);window.scrollTo(0,0);}}>Edit</button>
                  <button className="btn-del" onClick={async()=>{if(window.confirm("ডিলিট করবেন?")){await deleteDoc(doc(db,"products",p.id));fetchProducts();}}}>Del</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ====== CUSTOMER VIEW ======
  return (
    <div className="app-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {showNotifModal && (
        <div className="modal-bg" onClick={()=>setShowNotifModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 className="text-green mb-10">🔔 নোটিফিকেশন</h3>
            <p>{notification.text}</p>
            <button className="btn-primary mt-20" onClick={()=>setShowNotifModal(false)}>ঠিক আছে</button>
          </div>
        </div>
      )}

      <div className={`drawer-overlay ${isDrawerOpen?'active':''}`} onClick={()=>setIsDrawerOpen(false)}/>
      <div className={`side-drawer ${isDrawerOpen?'open':''}`}>
        <div className="drawer-head">
          <span>🌿 সাকিব স্টোর</span>
          <button className="drawer-close" onClick={()=>setIsDrawerOpen(false)}>✕</button>
        </div>
        <ul className="drawer-menu">
          <li onClick={()=>{changeTab('home');setIsDrawerOpen(false);}}>🏠 হোম</li>
          <li onClick={()=>{changeTab('profile');setIsDrawerOpen(false);}}>👤 প্রোফাইল</li>
          <li onClick={()=>{window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html','_blank');setIsDrawerOpen(false);}}>🚀 App Update</li>
          <li onClick={()=>{changeTab('about');setIsDrawerOpen(false);}}>ℹ️ About Us</li>
          <li className="admin-menu-link" onClick={()=>{setViewMode('adminLogin');setIsDrawerOpen(false);}}>🛡️ অ্যাডমিন প্যানেল</li>
        </ul>
      </div>

      <header className="main-header" style={{backgroundImage:`url(${headerImage})`}}>
        <div className="header-overlay">
          <button className="icon-btn" onClick={()=>setIsDrawerOpen(true)}>☰</button>
          <div className="header-title">সাকিব স্টোর</div>
          {/* FIX 5: Notification bell only on top-right */}
          <button className="icon-btn notif-bell-btn" onClick={()=>notification.show&&setShowNotifModal(true)}>
            🔔{notification.show&&<span className="notif-dot"/>}
          </button>
        </div>
      </header>

      <div className="marquee-wrapper">
        <div className="marquee-track">
          <span>📢 {scrollingNotice}&nbsp;&nbsp;&nbsp;&nbsp;📢 {scrollingNotice}</span>
        </div>
      </div>

      <main className="main-content">

        {/* HOME — FIX 3: category filters in-place; FIX 4: search works */}
        {activeTab==='home' && (
          <div className="page-home">
            <div className="search-wrapper">
              <input type="text" placeholder="যে কোন কিছু সার্চ করুন..."
                value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
              <span className="search-icon">🔍</span>
              {searchTerm && <button className="search-clear" onClick={()=>setSearchTerm('')}>✕</button>}
            </div>

            <div className="horizontal-categories">
              {cats.map(c=>(
                <button key={c} className={`cat-pill ${homeCat===c?'active':''}`}
                  onClick={()=>{setHomeCat(c);setSearchTerm('');}}>
                  {c}
                </button>
              ))}
            </div>

            {homeProducts.length===0 ? (
              <div className="empty-state text-center mt-30">
                <div className="empty-icon">🔍</div>
                <p>{searchTerm?`"${searchTerm}" পাওয়া যায়নি`:'এই ক্যাটাগরিতে পণ্য নেই'}</p>
                <button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}}
                  onClick={()=>{setHomeCat('সব পণ্য');setSearchTerm('');}}>সব পণ্য দেখুন</button>
              </div>
            ) : (
              <div className="product-grid-3">
                {homeProducts.map(p=>{
                  const ci=cart.find(x=>x.id===p.id);
                  const{baseQty}=parseUnitStr(p.unit);
                  const price=ci?(p.price/baseQty)*ci.qty:p.price;
                  const out=p.stock<=0;
                  return (
                    <div key={p.id} className={`product-card ${out?'out-of-stock':''}`}>
                      <div className="p-img-box"><img src={p.image||'https://placehold.co/120x120/e8f5e9/27ae60?text=P'} alt={p.name}/></div>
                      <h4 className="p-name">{p.name}</h4>
                      <p className="p-price">৳{toBanglaNum(price)}</p>
                      <p className="p-unit">{p.unit}</p>
                      <p className={`p-stock ${out?'text-red':''}`}>স্টক: {out?'শেষ':toBanglaNum(p.stock)}</p>
                      <div className="p-action">
                        {ci ? (
                          <div className="qty-controls">
                            <button className="btn-minus" onClick={()=>handleCart(p,'remove')}>-</button>
                            <span className="qty-text">{toBanglaNum(ci.qty)}</span>
                            <button className="btn-plus" onClick={()=>handleCart(p,'add')}>+</button>
                          </div>
                        ) : (
                          <button disabled={out} className={`btn-add ${out?'disabled':''}`} onClick={()=>handleCart(p,'add')}>
                            {out?'স্টক নেই':'যোগ করুন'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CATEGORIES — separate page */}
        {activeTab==='categories' && (
          <div className="page-categories">
            <div className="cat-sidebar">
              {cats.map(c=>(
                <div key={c} className={`cat-side-item ${catTabSel===c?'active':''}`} onClick={()=>setCatTabSel(c)}>{c}</div>
              ))}
            </div>
            <div className="cat-content">
              <h3 className="cat-title">{catTabSel}</h3>
              <div className="product-grid-2">
                {products.filter(p=>catTabSel==='সব পণ্য'||p.category===catTabSel).map(p=>{
                  const ci=cart.find(x=>x.id===p.id);
                  const{baseQty}=parseUnitStr(p.unit);
                  const price=ci?(p.price/baseQty)*ci.qty:p.price;
                  const out=p.stock<=0;
                  return (
                    <div key={p.id} className={`product-card ${out?'out-of-stock':''}`}>
                      <div className="p-img-box"><img src={p.image||'https://placehold.co/120x120/e8f5e9/27ae60?text=P'} alt={p.name}/></div>
                      <h4 className="p-name">{p.name}</h4>
                      <p className="p-price">৳{toBanglaNum(price)}</p>
                      <p className="p-unit">{p.unit}</p>
                      <div className="p-action mt-auto">
                        {ci?(
                          <div className="qty-controls">
                            <button className="btn-minus" onClick={()=>handleCart(p,'remove')}>-</button>
                            <span className="qty-text">{toBanglaNum(ci.qty)}</span>
                            <button className="btn-plus" onClick={()=>handleCart(p,'add')}>+</button>
                          </div>
                        ):(
                          <button disabled={out} className={`btn-add ${out?'disabled':''}`} onClick={()=>handleCart(p,'add')}>
                            {out?'স্টক নেই':'যোগ করুন'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CART */}
        {activeTab==='cart' && (
          <div className="page-cart">
            <h2 className="section-title text-center">আপনার কার্ট 🛒</h2>
            {cart.length===0 ? (
              <div className="empty-state text-center mt-30">
                <div className="empty-icon">🛒</div>
                <p>কার্ট খালি!</p>
                <button className="btn-primary mt-10" onClick={()=>changeTab('home')}>পণ্য বাছাই করুন</button>
              </div>
            ) : (
              <div className="cart-checkout-wrapper">
                <div className="cart-items-list">
                  {cart.map(item=>(
                    <div key={item.id} className="cart-item">
                      <img src={item.image||'https://placehold.co/50x50/e8f5e9/27ae60?text=P'} alt={item.name} className="cart-item-img"/>
                      <div className="c-info">
                        <strong>{item.name}</strong>
                        <p className="text-muted">{toBanglaNum(item.qty)}{parseUnitStr(item.unit).text}</p>
                      </div>
                      <div className="c-right">
                        <div className="c-price">৳{toBanglaNum((item.price/parseUnitStr(item.unit).baseQty)*item.qty)}</div>
                        <div className="qty-controls small">
                          <button className="btn-minus" onClick={()=>handleCart(item,'remove')}>-</button>
                          <span className="qty-text">{toBanglaNum(item.qty)}</span>
                          <button className="btn-plus" onClick={()=>handleCart(item,'add')}>+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="checkout-form mt-20">
                  <h3 className="sub-title">📍 কোথায় ডেলিভারি নিবেন?</h3>
                  <div className="selector-grid">
                    {deliveryLocations.map(loc=>(
                      <button key={loc} className={`select-box ${userInfo.locationType===loc?'active':''}`}
                        onClick={()=>setUserInfo({...userInfo,locationType:loc})}>
                        {loc}{loc!=='নিজে লেখুন'&&<span className="charge-hint">৳{getDeliveryCharge(loc)}</span>}
                      </button>
                    ))}
                  </div>
                  {userInfo.locationType==='নিজে লেখুন'&&(
                    <input type="text" className="custom-input mt-10" placeholder="আপনার জায়গার নাম লিখুন..."
                      value={customLoc} onChange={e=>setCustomLoc(e.target.value)}/>
                  )}
                  <h3 className="sub-title mt-20">🚚 ডেলিভারি তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম *" value={userInfo.name} onChange={e=>setUserInfo({...userInfo,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর *" value={userInfo.phone} onChange={e=>setUserInfo({...userInfo,phone:e.target.value})}/>
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা *" value={userInfo.district} onChange={e=>setUserInfo({...userInfo,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা *" value={userInfo.area} onChange={e=>setUserInfo({...userInfo,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং *" value={userInfo.address} onChange={e=>setUserInfo({...userInfo,address:e.target.value})}/>
                  </div>
                  <h3 className="sub-title mt-20">💳 পেমেন্ট পদ্ধতি</h3>
                  <div className="selector-grid cols-3">
                    {['Bkash','Nogod','Cash on Delivery'].map(pm=>(
                      <button key={pm} className={`select-box payment-box ${userInfo.paymentMethod===pm?'active':''}`}
                        onClick={()=>setUserInfo({...userInfo,paymentMethod:pm})}>
                        {pm==='Bkash'?'💗 Bkash':pm==='Nogod'?'🔴 Nogod':'💵 Cash on Delivery'}
                      </button>
                    ))}
                  </div>
                  {(userInfo.paymentMethod==='Bkash'||userInfo.paymentMethod==='Nogod')&&(
                    <div className="payment-instructions mt-10">
                      <p className="pay-number">📲 Personal: <strong>01723539738</strong></p>
                      <p className="text-muted text-sm mb-10">উপরের নম্বরে Send Money করুন:</p>
                      <input type="number" placeholder="যে নম্বর থেকে পাঠিয়েছেন *"
                        value={userInfo.senderNumber} onChange={e=>setUserInfo({...userInfo,senderNumber:e.target.value})} className="mb-10"/>
                      <input type="text" placeholder="Transaction ID *"
                        value={userInfo.transactionId} onChange={e=>setUserInfo({...userInfo,transactionId:e.target.value})}/>
                    </div>
                  )}
                  <div className="bill-summary mt-20">
                    <div className="bill-row"><span>পণ্যের দাম:</span><span>৳{toBanglaNum(totalCartPrice)}</span></div>
                    <div className="bill-row"><span>ডেলিভারি:</span><span>৳{toBanglaNum(deliveryCharge)}</span></div>
                    <div className="bill-row total"><span>মোট বিল:</span><span>৳{toBanglaNum(finalTotal)}</span></div>
                  </div>
                  <button className="btn-confirm-order mt-20" onClick={submitOrder}>
                    ✅ অর্ডার নিশ্চিত করুন (৳{toBanglaNum(finalTotal)})
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROFILE */}
        {activeTab==='profile' && (
          <div className="page-profile">
            {!user ? (
              <div className="auth-screen text-center">
                <div className="auth-logo">🛒</div>
                <h2 className="mb-10">লগইন করুন</h2>
                <p className="text-muted mb-20">অর্ডার ট্র্যাক ও তথ্য সেভ করতে লগইন করুন।</p>
                <button className="btn-google mb-15" onClick={handleGoogleLogin}>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" width="20"/>
                  Google দিয়ে লগইন করুন
                </button>
                <div className="divider">অথবা</div>
                <button className="btn-outline mt-15" onClick={handleGuestLogin}>👤 গেস্ট হিসেবে প্রবেশ করুন</button>
                <p className="text-muted mt-20 text-sm">Google লগইন করলে ডেটা চিরস্থায়ী থাকে।</p>
              </div>
            ) : (
              <div className="profile-dashboard">
                <div className="profile-header-box">
                  <div className="cover-photo" style={{backgroundImage:`url(${userInfo.coverPic||'https://placehold.co/400x150/27ae60/fff?text=Cover'})`}}>
                    <label className="upload-btn cover-upload">📷 কভার পরিবর্তন<input type="file" hidden accept="image/*" onChange={e=>handleImageUpload(e,'coverPic')}/></label>
                  </div>
                  <div className="avatar-section">
                    <div className="avatar" style={{backgroundImage:`url(${userInfo.profilePic||'https://placehold.co/100x100/27ae60/fff?text=U'})`}}>
                      <label className="upload-btn avatar-upload">📷<input type="file" hidden accept="image/*" onChange={e=>handleImageUpload(e,'profilePic')}/></label>
                    </div>
                    <div className="user-titles">
                      <h3>{userInfo.name||(user.isAnonymous?'গেস্ট ইউজার':'নাম দিন')}</h3>
                      <p>{user.email||(user.isAnonymous?'Guest Account':'')}</p>
                    </div>
                  </div>
                </div>
                <div className="profile-edit-card mt-20">
                  <h3 className="sub-title">✏️ আপনার তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম" value={userInfo.name} onChange={e=>setUserInfo({...userInfo,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর" value={userInfo.phone} onChange={e=>setUserInfo({...userInfo,phone:e.target.value})}/>
                    <div className="flex-row gap-10">
                      <input type="text" placeholder="জেলা" value={userInfo.district} onChange={e=>setUserInfo({...userInfo,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা" value={userInfo.area} onChange={e=>setUserInfo({...userInfo,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={userInfo.address} onChange={e=>setUserInfo({...userInfo,address:e.target.value})}/>
                    <button className="btn-primary mt-10" onClick={()=>saveProfileData()}>💾 তথ্য সেভ করুন</button>
                  </div>
                </div>
                <div className="order-history mt-20">
                  <h3 className="sub-title">📦 আপনার অর্ডার ({userOrders.length})</h3>
                  {userOrders.length===0?<p className="text-muted">কোনো অর্ডার নেই।</p>:(
                    userOrders.map(o=>(
                      <div key={o.id} className={`history-card ${getStatusClass(o.status)}`}>
                        <div className="hc-head">
                          <strong>Order #{o.id.slice(-6).toUpperCase()}</strong>
                          <span className={`badge-status ${getStatusClass(o.status)}`}>{o.status}</span>
                        </div>
                        <p className="text-sm text-muted">{o.date}</p>
                        <p className="mt-5"><b>পণ্য:</b> {o.items?.map(i=>`${i.name} (${i.qty})`).join(', ')}</p>
                        <p><b>মোট:</b> ৳{toBanglaNum(o.total)}</p>
                      </div>
                    ))
                  )}
                </div>
                <button className="btn-danger w-full mt-20" onClick={handleLogout}>🚪 লগ আউট করুন</button>
              </div>
            )}
          </div>
        )}

        {/* ABOUT */}
        {activeTab==='about' && (
          <div className="about-view">
            <h2 className="text-green mb-20">About Us</h2>
            <div className="about-logo">🌿</div>
            <h3 className="mb-10">সাকিব স্টোর</h3>
            <p className="about-desc">সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। আমরা সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            <div className="contact-box mt-30">
              <p className="contact-title">📞 যোগাযোগ:</p>
              <p>০১৭২৪৪০৯২১৯</p><p>০১৭৩৫৩৭৬০৭৯</p><p>০১৭২৩৫৩৯৭৩৮</p>
            </div>
          </div>
        )}
      </main>

      <footer className="bottom-nav">
        <div className={`nav-icon ${activeTab==='home'?'active':''}`} onClick={()=>changeTab('home')}><span>🏠</span><span>হোম</span></div>
        <div className={`nav-icon ${activeTab==='categories'?'active':''}`} onClick={()=>changeTab('categories')}><span>🗂️</span><span>ক্যাটাগরি</span></div>
        <div className={`nav-icon cart-nav ${activeTab==='cart'?'active':''}`} onClick={()=>changeTab('cart')}>
          <span>🛒</span><span>কার্ট</span>
          {cart.length>0&&<span className="nav-badge">{toBanglaNum(cart.length)}</span>}
        </div>
        <div className={`nav-icon ${activeTab==='profile'?'active':''}`} onClick={()=>changeTab('profile')}><span>👤</span><span>প্রোফাইল</span></div>
      </footer>
    </div>
  );
}

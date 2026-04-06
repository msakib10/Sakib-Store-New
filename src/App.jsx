import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, getDocs, addDoc, doc, updateDoc,
  getDoc, setDoc, query, where, deleteDoc, onSnapshot
} from "firebase/firestore";
import {
  getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInAnonymously, onAuthStateChanged, signOut, updateProfile,
  sendEmailVerification
} from "firebase/auth";
import './App.css';

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  componentDidCatch(e,i){console.error('App Error:',e,i);}
  render(){
    if(this.state.err) return(
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#f4fbf6',padding:30,textAlign:'center',fontFamily:'sans-serif'}}>
        <div style={{fontSize:60,marginBottom:16}}>⚠️</div>
        <h2 style={{color:'#1a7a43',marginBottom:12}}>কিছু একটা সমস্যা হয়েছে</h2>
        <p style={{color:'#666',marginBottom:8,fontSize:13}}>{this.state.err?.message}</p>
        <button onClick={()=>window.location.reload()} style={{background:'#27ae60',color:'#fff',border:'none',padding:'12px 28px',borderRadius:10,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:16}}>পুনরায় চেষ্টা করুন</button>
      </div>
    );
    return this.props.children;
  }
}

// ─── Firebase Config (ডোমেইন আপডেট করা হয়েছে) ─────────────────────────────────
const FB = initializeApp({
  apiKey:"AIzaSyBSKT0kmhfyLHSur-Z8nnj3jrYn2KBcP0M",
  authDomain:"sakibstore.shop", // নতুন ডোমেইন
  projectId:"sakib-store1",
  storageBucket:"sakib-store1.firebasestorage.app",
  messagingSenderId:"514373347826",
  appId:"1:514373347826:web:a778be5386cd5362d1636b"
});
const db = getFirestore(FB);
const auth = getAuth(FB);
const gp = new GoogleAuthProvider();

// ─── Constants ─────────────────────────────────────────────────────────────────
const CATS=['সব পণ্য','পাইকারি','চাল','ডাল','তেল','মসলা','পানীয়','অন্যান্য'];
const DLOCS=["গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া","ঘোনাপাড়া","বকচর","সিংগাইর উপজেলার ভেতরে","নিজে লেখুন"];
const EMOJIS=['👨','👩','👦','👧','🧔','👱','👴','👵','🧑','👮','👷','🧑‍🌾','🧑‍🍳','🧑‍💼','🦸','😊','😎','🥳','🤩','🐱','🐶','🦊','🐼','🐨','🦁','🐯','🦄','🐸','🌟','🎯','🚀','🎵','🌈'];
const DEFAULT_COVERS=['linear-gradient(135deg,#1a7a43,#27ae60)','linear-gradient(135deg,#0f3460,#16213e)','linear-gradient(135deg,#8e44ad,#6c3483)','linear-gradient(135deg,#e67e22,#d35400)','linear-gradient(135deg,#2980b9,#1a5276)','linear-gradient(135deg,#16a085,#1abc9c)'];
const DEFINFO={name:'',phone:'',locationType:'গোবিন্দল',district:'মানিকগঞ্জ',area:'সিংগাইর',address:'',paymentMethod:'Cash on Delivery',senderNumber:'',transactionId:'',profileEmoji:'👤',coverPhoto:'',coverGradient:'linear-gradient(135deg,#1a7a43,#27ae60)'};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const parseUnit=u=>{
  if(!u)return{baseQty:1,text:'টি',step:1};
  try{const s=String(u).replace(/[০-৯]/g,d=>'০১২৩৪৫৬৭৮৯'.indexOf(d));const m=s.match(/^([\d.]+)\s*(.*)$/);if(m){const n=parseFloat(m[1]),t=m[2]?.trim()||'টি';const step=(t.includes('গ্রাম')||t.includes('gm')||t.includes('মিলি')||t.includes('ml'))?(n>=100?50:10):1;return{baseQty:n,text:t,step};}}catch(_){}
  return{baseQty:1,text:u,step:1};
};
const bn=n=>{try{if(n==null||n===''||isNaN(n))return'০';return Number(n).toFixed(0).replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[d]);}catch(_){return String(n);}};
const getDC=loc=>{if(["গোবিন্দল","সিংগাইর বাজার","নীলটেক","পুকুরপাড়া","ঘোনাপাড়া","বকচর"].includes(loc))return 20;if(loc==="সিংগাইর উপজেলার ভেতরে")return 40;return 50;};

const STATUS_STYLE = {
  'Pending':     { bg:'#fff8e1', border:'#f59e0b', color:'#92400e', icon:'⏳', label:'অপেক্ষমাণ' },
  'Confirmed':   { bg:'#ecfdf5', border:'#10b981', color:'#065f46', icon:'✅', label:'নিশ্চিত' },
  'On Delivery': { bg:'#eff6ff', border:'#3b82f6', color:'#1e40af', icon:'🚚', label:'ডেলিভারিতে' },
  'Delivered':   { bg:'#f0fdf4', border:'#16a34a', color:'#14532d', icon:'🏁', label:'পৌঁছেছে' },
  'Cancelled':   { bg:'#fef2f2', border:'#ef4444', color:'#7f1d1d', icon:'❌', label:'বাতিল' },
};
const getStatusStyle = s => STATUS_STYLE[s] || STATUS_STYLE['Pending'];

const safeDate=d=>{
  try{
    if(!d)return'';if(typeof d==='string')return d;
    if(d?.toDate instanceof Function)return d.toDate().toLocaleString('bn-BD');
    if(d?.seconds)return new Date(d.seconds*1000).toLocaleString('bn-BD');
    if(d instanceof Date)return d.toLocaleString('bn-BD');
    return String(d);
  }catch(_){return'';}
};

const CACHE_KEY='sakib_products_cache';
const saveProductsCache=p=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(p));}catch(_){}};
const loadProductsCache=()=>{try{const d=localStorage.getItem(CACHE_KEY);return d?JSON.parse(d):[];}catch(_){return[];}};

// ─── Main App ──────────────────────────────────────────────────────────────────
function AppInner(){
  const [products,setProducts]=useState(loadProductsCache());
  const [headerImg,setHeaderImg]=useState('https://placehold.co/820x312/1a7a43/ffffff?text=Sakib+Store');
  const [notice,setNotice]=useState('সাকিব স্টোরে আপনাকে স্বাগতম! 🌿 সেরা মানের পণ্য, সাশ্রয়ী মূল্যে।');
  const [notifications,setNotifications]=useState([]);
  const [coverPhotos,setCoverPhotos]=useState([]);
  const [showNotifModal,setShowNotifModal]=useState(false);
  const [showEmojiPicker,setShowEmojiPicker]=useState(false);
  const [showCoverPicker,setShowCoverPicker]=useState(false);
  const [showLogoutConfirm,setShowLogoutConfirm]=useState(false);
  const [appReady,setAppReady]=useState(false);

  const [tab,setTab]=useState('home');
  const [tabHist,setTabHist]=useState(['home']);
  const [mode,setMode]=useState('customer');
  const [drawer,setDrawer]=useState(false);
  const [homeCat,setHomeCat]=useState('সব পণ্য');
  const [search,setSearch]=useState('');
  const [catSel,setCatSel]=useState('সব পণ্য');

  const [user,setUser]=useState(null);
  const [cart,setCart]=useState([]);
  const [userOrders,setUserOrders]=useState([]);
  const [customLoc,setCustomLoc]=useState('');
  const [info,setInfo]=useState({...DEFINFO});
  const [expandedOrder,setExpandedOrder]=useState(null);

  // Auth states
  const [authMode,setAuthMode]=useState('choice');
  const [emailInput,setEmailInput]=useState('');
  const [passInput,setPassInput]=useState('');
  const [nameInput,setNameInput]=useState('');
  const [authLoading,setAuthLoading]=useState(false);
  const [verifyBanner,setVerifyBanner]=useState(null);

  // Admin states
  const [adminPass,setAdminPass]=useState('');
  const [allOrders,setAllOrders]=useState([]);
  const [adminLoading,setAdminLoading]=useState(false);
  const [adminErr,setAdminErr]=useState('');
  const [adminFilter,setAdminFilter]=useState('All');
  const [adminTab,setAdminTab]=useState('stock');
  const [editId,setEditId]=useState(null);
  const [newP,setNewP]=useState({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});
  const [newNotif,setNewNotif]=useState({text:'',durationMins:60});
  const [newCoverUrl,setNewCoverUrl]=useState('');

  // Admin roles
  const [adminRole,setAdminRole]=useState(null); 
  const [adminsList,setAdminsList]=useState([]);
  const [showAddAdmin,setShowAddAdmin]=useState(false);
  const [newAdminUid,setNewAdminUid]=useState('');
  const [newAdminRole,setNewAdminRole]=useState('editor');
  const [adminTitleClicks,setAdminTitleClicks]=useState(0);
  const [aboutClicks,setAboutClicks]=useState(0);

  const [toast,setToast]=useState(null);
  const showToast=useCallback((msg,type='success')=>{setToast({msg,type});setTimeout(()=>setToast(null),4000);},[]);
  const backTime=useRef(0);
  const orderUnsubRef=useRef(null);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(()=>{
    loadProducts();
    loadSettings();
    loadAdmins();

    getRedirectResult(auth)
      .then(result=>{
        if(result?.user){
          showToast('গুগল লগইন সফল! ✅');
        }
      })
      .catch(e=>{
        const code=e?.code||'';
        if(code==='auth/unauthorized-domain'){
          showToast('Firebase Authorized Domains-এ ডোমেইন যোগ করুন','error');
        }
      });

    const unsub=onAuthStateChanged(auth,cu=>{
      try{
        if(cu){
          setUser({id:cu.uid,isAnon:cu.isAnonymous,email:cu.email,name:cu.displayName,emailVerified:cu.emailVerified});
          loadUserData(cu.uid);
          subscribeToUserOrders(cu.uid);
          if(!cu.isAnonymous && !cu.emailVerified && cu.email){
            setVerifyBanner({
              msg:`📧 আপনার ইমেইল (${cu.email}) ভেরিফাই করুন। Spam ফোল্ডারও চেক করুন।`,
              type:'warn'
            });
          } else {
            setVerifyBanner(null);
          }
        }else{
          setUser(null);
          setVerifyBanner(null);
          setAdminRole(null);
          if(orderUnsubRef.current){orderUnsubRef.current();orderUnsubRef.current=null;}
          try{const d=localStorage.getItem('guestInfo');if(d)setInfo(p=>({...DEFINFO,...p,...JSON.parse(d)}));}catch(_){}
        }
      }catch(e){console.error('auth state:',e);}
      setAppReady(true);
    },err=>{console.error('auth err:',err);setAppReady(true);});

    window.history.pushState(null,null,window.location.pathname);
    const onPop=()=>{
      window.history.pushState(null,null,window.location.pathname);
      if(drawer){setDrawer(false);return;}
      setTabHist(prev=>{
        if(prev.length>1){const n=[...prev];n.pop();setTab(n[n.length-1]);return n;}
        const now=Date.now();
        if(now-backTime.current<2000)window.close();
        else{backTime.current=now;showToast('আবার Back চাপলে বের হবে','warning');}
        return prev;
      });
    };
    window.addEventListener('popstate',onPop);
    return()=>{try{unsub();}catch(_){}if(orderUnsubRef.current)orderUnsubRef.current();window.removeEventListener('popstate',onPop);};
  // eslint-disable-next-line
  },[]);

  const goto=t=>{setTab(t);setTabHist(p=>[...p,t]);window.scrollTo(0,0);};

  const subscribeToUserOrders=uid=>{
    if(orderUnsubRef.current){orderUnsubRef.current();orderUnsubRef.current=null;}
    try{
      const q=query(collection(db,'orders'),where('userId','==',uid));
      orderUnsubRef.current=onSnapshot(q,snap=>{
        const orders=snap.docs.map(d=>{
          const data=d.data();
          return{id:d.id,...data,date:safeDate(data.date||data.timestamp)};
        }).sort((a,b)=>(b.timestamp?.seconds||b.timestamp||0)-(a.timestamp?.seconds||a.timestamp||0));
        setUserOrders(orders);
      },err=>console.error('order snapshot:',err));
    }catch(e){console.error('subscribeToUserOrders:',e);}
  };

  // ── Data ──────────────────────────────────────────────────────────────────────
  const loadProducts=async()=>{
    try{
      const s=await getDocs(collection(db,'products'));
      const prods=s.docs.map(d=>({id:d.id,...d.data()}));
      setProducts(prods);saveProductsCache(prods);
    }catch(e){
      const cached=loadProductsCache();
      if(cached.length>0){setProducts(cached);showToast('অফলাইন মোড: ক্যাশ থেকে পণ্য দেখানো হচ্ছে','warning');}
    }
  };

  const loadSettings=async()=>{
    try{
      const s=await getDoc(doc(db,'settings','general'));
      if(s.exists()){
        const d=s.data();
        if(d.header)setHeaderImg(d.header);
        if(d.notice)setNotice(d.notice);
        const now=Date.now();
        if(Array.isArray(d.notifications)){setNotifications(d.notifications.filter(n=>now<=n.expiresAt));}
        else if(d.notification&&now<=d.notification.expiresAt){setNotifications([d.notification]);}
        if(Array.isArray(d.coverPhotos)&&d.coverPhotos.length>0){
          setCoverPhotos(d.coverPhotos);
        }
      }
    }catch(e){console.error('loadSettings',e);}
  };

  const loadAdmins=async()=>{
    try{
      const snap=await getDocs(collection(db,'Admins'));
      setAdminsList(snap.docs.map(d=>({id:d.id,...d.data()})));
    }catch(e){console.error('loadAdmins',e);}
  };

  const loadAdminRole=async(uid)=>{
    try{
      const d=await getDoc(doc(db,'Admins',uid));
      if(d.exists())setAdminRole(d.data().role||null);
      else setAdminRole(null);
    }catch(_){setAdminRole(null);}
  };

  const addAdmin=async()=>{
    if(!newAdminUid.trim())return showToast('UID দিন!','error');
    try{
      await setDoc(doc(db,'Admins',newAdminUid.trim()),{role:newAdminRole,uid:newAdminUid.trim(),createdAt:Date.now()});
      showToast('Admin যোগ হয়েছে! ✅');setNewAdminUid('');setShowAddAdmin(false);loadAdmins();
    }catch(e){showToast('সমস্যা: '+e.message,'error');}
  };

  const removeAdmin=async(uid,role)=>{
    if(role==='master'&&adminRole!=='master'){showToast('Master admin-কে remove করা যাবে না!','error');return;}
    if(!window.confirm('এই admin-কে সরাতে চান?'))return;
    try{await deleteDoc(doc(db,'Admins',uid));showToast('সরানো হয়েছে।');loadAdmins();}
    catch(e){showToast('সমস্যা','error');}
  };

  const loadUserData=async uid=>{
    try{
      const u=await getDoc(doc(db,'users',uid));
      if(u.exists()&&u.data().info)setInfo(p=>({...DEFINFO,...p,...u.data().info}));
      loadAdminRole(uid);
    }catch(e){console.error('loadUserData',e);}
  };

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const googleLogin=async()=>{
    setAuthLoading(true);
    try{
      await signInWithRedirect(auth, gp);
    }catch(e){
      showToast('লগইন সমস্যা: '+e.code,'error');
      setAuthLoading(false);
    }
  };

  const emailLogin=async()=>{
    if(!emailInput||!passInput)return showToast('ইমেইল ও পাসওয়ার্ড দিন!','error');
    setAuthLoading(true);
    try{
      const r=await signInWithEmailAndPassword(auth,emailInput,passInput);
      if(!r.user.emailVerified){
        await signOut(auth);
        setVerifyBanner({
          msg:`📧 ইমেইল ভেরিফাই করুন! ${emailInput} ইনবক্স ও Spam ফোল্ডার চেক করুন।`,
          type:'warn'
        });
        showToast('ইমেইল ভেরিফাই করুন!','error');
      }else{
        setVerifyBanner(null);
        showToast('লগইন সফল! ✅');
        setAuthMode('choice');setEmailInput('');setPassInput('');
        goto('home'); // ভেরিফাই করা থাকলে সরাসরি হোমে নিয়ে যাবে
      }
    }catch(e){
      showToast('ইমেইল বা পাসওয়ার্ড ভুল।','error');
    }
    setAuthLoading(false);
  };

  const emailRegister=async()=>{
    if(!emailInput||!passInput||!nameInput)return showToast('নাম, ইমেইল ও পাসওয়ার্ড দিন!','error');
    if(passInput.length<6)return showToast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে।','error');
    const emailRegex=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRegex.test(emailInput))return showToast('সঠিক ইমেইল ঠিকানা দিন।','error');
    setAuthLoading(true);
    try{
      const r=await createUserWithEmailAndPassword(auth,emailInput,passInput);
      await updateProfile(r.user,{displayName:nameInput});
      await sendEmailVerification(r.user);
      await signOut(auth);
      setAuthMode('choice');setEmailInput('');setPassInput('');setNameInput('');
      setVerifyBanner({
        msg:`✅ অ্যাকাউন্ট তৈরি হয়েছে! এখন ${emailInput} ইনবক্স বা Spam ফোল্ডার চেক করে লিংকে ক্লিক করে ভেরিফাই করুন।`,
        type:'info'
      });
    }catch(e){
      if(e.code==='auth/email-already-in-use')showToast('এই ইমেইল আগে থেকে ব্যবহার হচ্ছে।','error');
      else showToast('সমস্যা: '+e.code,'error');
    }
    setAuthLoading(false);
  };

  const guestLogin=async()=>{
    try{await signInAnonymously(auth);showToast('গেস্ট হিসেবে প্রবেশ করেছেন!');}
    catch(e){showToast('সমস্যা: '+(e?.message||''),'error');}
  };

  const confirmLogout=()=>setShowLogoutConfirm(true);
  const doLogout=async()=>{
    setShowLogoutConfirm(false);
    if(orderUnsubRef.current){orderUnsubRef.current();orderUnsubRef.current=null;}
    try{await signOut(auth);}catch(_){}
    setInfo({...DEFINFO});setCart([]);setUserOrders([]);
    localStorage.removeItem('guestInfo');
    goto('home');
  };

  const saveProfile=async(data=info)=>{
    try{
      if(user&&!user.isAnon){
        await setDoc(doc(db,'users',user.id),{info:data},{merge:true});
        showToast('প্রোফাইল আপডেট! ✅');
      }else{
        localStorage.setItem('guestInfo',JSON.stringify(data));
        showToast('তথ্য সাময়িকভাবে সেভ হয়েছে।');
      }
    }catch(e){showToast('সেভ সমস্যা','error');}
  };

  // ── Cart ──────────────────────────────────────────────────────────────────────
  const cartAction=(product,action)=>{
    if(action==='add'&&product.stock<=0){showToast('এই পণ্যের স্টক শেষ!','error');return;}
    const{baseQty,step}=parseUnit(product.unit);
    setCart(prev=>{
      const ex=prev.find(i=>i.id===product.id);
      if(action==='add'){
        if(ex){if((ex.qty+step)>product.stock*baseQty){showToast('স্টকের বেশি অর্ডার সম্ভব নয়!','error');return prev;}return prev.map(i=>i.id===product.id?{...i,qty:i.qty+step}:i);}
        return[...prev,{...product,qty:baseQty}];
      }
      if(action==='remove'&&ex){if(ex.qty>baseQty)return prev.map(i=>i.id===product.id?{...i,qty:i.qty-step}:i);return prev.filter(i=>i.id!==product.id);}
      return prev;
    });
  };

  const cartTotal=cart.reduce((a,i)=>a+(i.price/parseUnit(i.unit).baseQty)*i.qty,0);
  const dCharge=cart.length>0?getDC(info.locationType):0;
  const finalTotal=cartTotal+dCharge;

  const submitOrder=async()=>{
    if(!info.name||!info.phone||!info.district||!info.area||!info.address)return showToast('ডেলিভারির সকল তথ্য দিন!','error');
    const loc=info.locationType==='নিজে লেখুন'?customLoc:info.locationType;
    if(info.locationType==='নিজে লেখুন'&&!customLoc)return showToast('জায়গার নাম লিখুন!','error');
    if((info.paymentMethod==='Bkash'||info.paymentMethod==='Nogod')&&(!info.senderNumber||!info.transactionId))return showToast('সেন্ডার নম্বর ও TrxID দিন!','error');
    try{
      await addDoc(collection(db,'orders'),{
        items:cart,userInfo:{...info,finalLocation:loc},
        userId:user?.id||'Guest_'+Date.now(),
        paymentMethod:info.paymentMethod,total:finalTotal,
        status:'Pending',
        date:new Date().toLocaleString('bn-BD'),
        timestamp:Date.now(),
        cancelledByCustomer:false
      });
      for(const item of cart){
        const{baseQty}=parseUnit(item.unit);
        try{await updateDoc(doc(db,'products',item.id),{stock:Math.max(0,item.stock-item.qty/baseQty)});}catch(_){}
      }
      if(user&&!user.isAnon)await setDoc(doc(db,'users',user.id),{info},{merge:true});
      showToast('অর্ডার সফল! 🎉');setCart([]);loadProducts();goto('profile');
    }catch(e){showToast('সমস্যা: '+(e?.message||''),'error');}
  };

  const cancelOrder=async(orderId)=>{
    if(!window.confirm('অর্ডারটি বাতিল করতে চান? এটি স্থায়ীভাবে বাতিল হবে।'))return;
    try{
      await updateDoc(doc(db,'orders',orderId),{
        status:'Cancelled',
        cancelledByCustomer:true,
        cancelledAt:Date.now()
      });
      showToast('অর্ডার বাতিল করা হয়েছে।');
    }catch(e){showToast('বাতিল করতে সমস্যা হয়েছে।','error');}
  };

  // ── Admin ──────────────────────────────────────────────────────────────────────
  const fetchOrders=async()=>{
    setAdminLoading(true);setAdminErr('');
    try{
      const snap=await Promise.race([
        getDocs(collection(db,'orders')),
        new Promise((_,r)=>setTimeout(()=>r(new Error('TIMEOUT')),10000))
      ]);
      const orders=snap.docs.map(d=>{
        const data=d.data();
        return{id:d.id,...data,date:safeDate(data.date||data.timestamp)};
      }).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
      setAllOrders(orders);
    }catch(e){
      const code=String(e?.code||e?.message||'');
      if(code.includes('TIMEOUT'))setAdminErr('TIMEOUT');
      else if(code.includes('permission'))setAdminErr('RULES');
      else setAdminErr('ERR:'+code);
    }finally{setAdminLoading(false);}
  };

  const saveProduct=async()=>{
    if(!newP.name||!newP.price)return showToast('নাম ও দাম দিন!','error');
    try{
      const data={...newP,price:Number(newP.price),stock:Number(newP.stock)};
      if(editId){await updateDoc(doc(db,'products',editId),data);showToast('পণ্য আপডেট! ✅');}
      else{await addDoc(collection(db,'products'),data);showToast('পণ্য যোগ! ✅');}
      setEditId(null);setNewP({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});loadProducts();
    }catch(e){showToast(e?.message||'সমস্যা','error');}
  };

  const sendNotif=async()=>{
    if(!newNotif.text)return;
    const nd={id:Date.now(),text:newNotif.text,expiresAt:Date.now()+newNotif.durationMins*60000};
    try{
      const s=await getDoc(doc(db,'settings','general'));
      const existing=s.exists()&&Array.isArray(s.data().notifications)?s.data().notifications:[];
      const updated=[...existing.filter(n=>Date.now()<=n.expiresAt),nd];
      await setDoc(doc(db,'settings','general'),{notifications:updated,notification:nd},{merge:true});
      setNotifications(updated);
      showToast('নোটিফিকেশন পাঠানো হয়েছে! ✅');setNewNotif({text:'',durationMins:60});
    }catch(e){showToast('সমস্যা','error');}
  };

  const saveSettings=async()=>{
    try{await setDoc(doc(db,'settings','general'),{header:headerImg,notice},{merge:true});showToast('সেটিংস সেভ! ✅');}
    catch(e){showToast('সমস্যা','error');}
  };

  const addCoverPhoto=async()=>{
    if(!newCoverUrl.trim())return;
    const updated=[...coverPhotos,newCoverUrl.trim()];
    setCoverPhotos(updated);setNewCoverUrl('');
    try{await setDoc(doc(db,'settings','general'),{coverPhotos:updated},{merge:true});showToast('কভার ফটো যোগ! ✅');}
    catch(e){showToast('সমস্যা','error');}
  };
  const removeCoverPhoto=async idx=>{
    const updated=coverPhotos.filter((_,i)=>i!==idx);
    setCoverPhotos(updated);
    try{await setDoc(doc(db,'settings','general'),{coverPhotos:updated},{merge:true});showToast('মুছে ফেলা হয়েছে।');}catch(_){}
  };

  const filtered=products.filter(p=>{const c=homeCat==='সব পণ্য'||p.category===homeCat;const s=!search||p.name.toLowerCase().includes(search.toLowerCase());return c&&s;});
  const isHome=tab==='home';
  const activeNotifs=notifications.filter(n=>Date.now()<=n.expiresAt);

  const PCard=({p})=>{
    const ci=cart.find(x=>x.id===p.id);
    const{baseQty}=parseUnit(p.unit);
    const price=ci?(p.price/baseQty)*ci.qty:p.price;
    const out=p.stock<=0;
    return(
      <div className={`product-card ${out?'out-of-stock':''}`}>
        <div className="p-img-box"><img src={p.image||'https://placehold.co/120x120/e8f5e9/27ae60?text=P'} alt={p.name} onError={e=>{e.target.src='https://placehold.co/120x120/e8f5e9/27ae60?text=P';}}/></div>
        {out&&<div className="out-badge">স্টক শেষ</div>}
        <h4 className="p-name">{p.name}</h4>
        <p className="p-price">৳{bn(price)}</p>
        <p className="p-unit">{p.unit}</p>
        {!out&&<p className="p-stock">স্টক: {bn(p.stock)}</p>}
        <div className="p-action">
          {out?(<button className="btn-add disabled" disabled>স্টক নেই</button>
          ):ci?(<div className="qty-controls"><button className="btn-minus" onClick={()=>cartAction(p,'remove')}>-</button><span className="qty-text">{bn(ci.qty)}</span><button className="btn-plus" onClick={()=>cartAction(p,'add')}>+</button></div>
          ):(<button className="btn-add" onClick={()=>cartAction(p,'add')}>যোগ করুন</button>)}
        </div>
      </div>
    );
  };

  if(!appReady)return(
    <div className="splash-screen">
      <div style={{fontSize:72,marginBottom:8,animation:'pulse 1.5s ease infinite'}}>🌿</div>
      <h2 style={{color:'#fff',fontSize:28,fontWeight:700,marginBottom:20}}>সাকিব স্টোর</h2>
      <div className="splash-spinner"/>
    </div>
  );

  // ══════ ADMIN LOGIN ══════
  if(mode==='adminLogin')return(
    <div className="fullscreen-center">
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <div className="admin-login-box">
        <div style={{fontSize:56,marginBottom:12}}>🛡️</div>
        <h2>অ্যাডমিন লগইন</h2>
        <input type="password" className="admin-input" placeholder="পাসওয়ার্ড দিন..." value={adminPass} onChange={e=>setAdminPass(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){if(adminPass==='sakib123'){setMode('admin');setAdminTab('stock');setAdminPass('');loadAdmins();if(user)loadAdminRole(user.id);}else showToast('ভুল পাসওয়ার্ড!','error');}}}/>
        <button className="btn-primary" onClick={()=>{if(adminPass==='sakib123'){setMode('admin');setAdminTab('stock');setAdminPass('');loadAdmins();if(user)loadAdminRole(user.id);}else showToast('ভুল পাসওয়ার্ড!','error');}}>লগইন</button>
        <button className="btn-outline mt-10" onClick={()=>{setMode('customer');goto('home');}}>← ফিরে যান</button>
      </div>
    </div>
  );

  // ══════ ADMIN PANEL ══════
  if(mode==='admin') return(
    <div className="admin-wrapper">
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      <header className="admin-header">
        <button className="admin-back-btn" onClick={()=>{setMode('customer');goto('home');}}>← বের হোন</button>
        <h2>অ্যাডমিন ড্যাশবোর্ড</h2>
        <span/>
      </header>
      <div className="admin-tabs">
        <button className={adminTab==='stock'?'active':''} onClick={()=>setAdminTab('stock')}>📊 স্টক ও সেটিংস</button>
        <button className={adminTab==='orders'?'active':''} onClick={()=>{setAdminTab('orders');fetchOrders();}}>📦 অর্ডারসমূহ</button>
        {(adminRole==='master'||adminRole==='super_admin')&&(
          <button className={adminTab==='admins'?'active':''} onClick={()=>{setAdminTab('admins');loadAdmins();}}>👮 অ্যাডমিনস</button>
        )}
      </div>
      <div className="admin-content">

        {/* ── STOCK & SETTINGS ── */}
        {adminTab==='stock'&&(<>
          <div className="admin-grid-layout">
            <div className="admin-col">
              <div className="admin-card">
                <h4>🖼️ হেডার ছবি (URL)</h4>
                <input type="text" placeholder="ছবির লিঙ্ক..." value={headerImg} onChange={e=>setHeaderImg(e.target.value)}/>
                {headerImg&&<img src={headerImg} alt="preview" style={{width:'100%',height:70,objectFit:'cover',borderRadius:8,marginTop:8}} onError={e=>{e.target.style.display='none';}}/>}
                <h4 className="mt-15">📢 চলমান নোটিশ</h4>
                <textarea placeholder="নোটিশ লিখুন..." value={notice} onChange={e=>setNotice(e.target.value)}/>
                <button className="btn-primary mt-10" onClick={saveSettings}>সেভ করুন</button>
              </div>
              <div className="admin-card">
                <h4>🔔 পুশ নোটিফিকেশন</h4>
                <input type="text" placeholder="নোটিফিকেশন মেসেজ..." value={newNotif.text} onChange={e=>setNewNotif({...newNotif,text:e.target.value})}/>
                <input type="number" className="mt-10" placeholder="কত মিনিট স্থায়ী?" value={newNotif.durationMins} onChange={e=>setNewNotif({...newNotif,durationMins:+e.target.value})}/>
                <button className="btn-warning mt-10" onClick={sendNotif}>সেন্ড করুন</button>
                {activeNotifs.length>0&&<div style={{marginTop:10}}>{activeNotifs.map(n=><div key={n.id} style={{fontSize:12,padding:'6px 10px',background:'#fff8e1',borderRadius:8,marginBottom:4}}>🔔 {n.text}</div>)}</div>}
              </div>
              <div className="admin-card">
                <h4>🖼️ কভার ফটো</h4>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <input type="text" placeholder="ছবির URL..." value={newCoverUrl} onChange={e=>setNewCoverUrl(e.target.value)}
                    style={{flex:1,padding:'8px 12px',border:'1.5px solid var(--border)',borderRadius:9,fontFamily:'var(--font)',fontSize:13,background:'var(--green-pale)',outline:'none'}}
                    onKeyDown={e=>{if(e.key==='Enter')addCoverPhoto();}}/>
                  <button className="btn-primary" style={{width:'auto',padding:'8px 14px'}} onClick={addCoverPhoto}>যোগ</button>
                </div>
                <div className="cover-admin-grid">
                  {coverPhotos.length===0&&<p style={{fontSize:12,color:'var(--muted)'}}>কোনো কভার ফটো নেই।</p>}
                  {coverPhotos.map((url,i)=>(<div key={i} className="cover-admin-item"><img src={url} alt="" onError={e=>{e.target.src='https://placehold.co/80x40/e8f5e9/27ae60?text=err';}}/><button onClick={()=>removeCoverPhoto(i)}>✕</button></div>))}
                </div>
              </div>
            </div>
            <div className="admin-col">
              <div className="admin-card">
                <h3 style={{color:'var(--green)',marginBottom:12}}>{editId?"✏️ এডিট পণ্য":"➕ নতুন পণ্য"}</h3>
                <input type="text" placeholder="পণ্যের নাম" className="mb-10" value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})}/>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <input type="number" placeholder="দাম (৳)" value={newP.price} onChange={e=>setNewP({...newP,price:e.target.value})}/>
                  <input type="text" placeholder="পরিমাণ (১ কেজি...)" value={newP.unit} onChange={e=>setNewP({...newP,unit:e.target.value})}/>
                </div>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <select value={newP.category} onChange={e=>setNewP({...newP,category:e.target.value})}>{CATS.filter(c=>c!=='সব পণ্য').map(c=><option key={c}>{c}</option>)}</select>
                  <input type="number" placeholder="স্টক" value={newP.stock} onChange={e=>setNewP({...newP,stock:e.target.value})}/>
                </div>
                <input type="text" placeholder="ছবির URL" className="mb-10" value={newP.image} onChange={e=>setNewP({...newP,image:e.target.value})}/>
                {newP.image&&<img src={newP.image} alt="" style={{width:'100%',height:60,objectFit:'cover',borderRadius:8,marginBottom:8}} onError={e=>{e.target.style.display='none';}}/>}
                <div style={{display:'flex',gap:8}}>
                  <button className="btn-primary flex-1" onClick={saveProduct}>{editId?"আপডেট":"যোগ করুন"}</button>
                  {editId&&<button className="btn-danger" onClick={()=>{setEditId(null);setNewP({name:'',price:'',image:'',category:'পাইকারি',stock:100,unit:'১ কেজি'});}}>বাতিল</button>}
                </div>
              </div>
            </div>
          </div>
          <h3 className="section-title mt-20">স্টক লিস্ট ({products.length}টি)</h3>
          <div className="stock-list-grid">
            {products.map(p=>(
              <div key={p.id} className="stock-item-row">
                <img src={p.image||'https://placehold.co/50x50/27ae60/fff?text=P'} alt={p.name} onError={e=>{e.target.src='https://placehold.co/50x50/27ae60/fff?text=P';}}/>
                <div className="si-details"><strong>{p.name}</strong><p>৳{p.price}/{p.unit} | স্টক: <span style={{color:p.stock<=5?'#dc2626':'inherit',fontWeight:700}}>{p.stock}</span></p></div>
                <button className="btn-edit" onClick={()=>{setEditId(p.id);setNewP({...p,price:String(p.price),stock:String(p.stock)});window.scrollTo(0,0);}}>Edit</button>
                <button className="btn-del" onClick={async()=>{if(window.confirm("ডিলিট করবেন?")){try{await deleteDoc(doc(db,'products',p.id));loadProducts();}catch(e){showToast('সমস্যা','error');}}}}>Del</button>
              </div>
            ))}
          </div>
        </>)}

        {/* ── ADMINS MANAGEMENT ── */}
        {adminTab==='admins'&&(<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <h3 className="section-title" style={{marginBottom:0}}
              onClick={()=>{
                const n=adminTitleClicks+1;setAdminTitleClicks(n);
                if(n>=5&&adminRole==='master'){setAdminTitleClicks(0);setShowAddAdmin(true);}
              }}
              style={{cursor:'pointer'}}>
              👮 অ্যাডমিন ম্যানেজমেন্ট {adminRole==='master'&&<span style={{fontSize:11,color:'var(--muted)'}}>(৫ বার ক্লিক করুন নতুন যোগ করতে)</span>}
            </h3>
            {adminRole==='master'&&<button className="btn-primary" style={{width:'auto',padding:'7px 14px',fontSize:13}} onClick={()=>setShowAddAdmin(true)}>+ নতুন Admin</button>}
          </div>

          {showAddAdmin&&adminRole==='master'&&(
            <div style={{background:'#f0fdf4',border:'1.5px solid var(--border)',borderRadius:12,padding:16,marginBottom:14}}>
              <h4 style={{marginBottom:12,color:'var(--green-dk)'}}>নতুন Admin যোগ করুন</h4>
              <p style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>Firebase Authentication → Users থেকে UID কপি করুন।</p>
              <input type="text" placeholder="Firebase User UID" value={newAdminUid} onChange={e=>setNewAdminUid(e.target.value)}
                style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border)',borderRadius:9,fontFamily:'var(--font)',fontSize:13,marginBottom:10,outline:'none'}}/>
              <select value={newAdminRole} onChange={e=>setNewAdminRole(e.target.value)}
                style={{width:'100%',padding:'9px 12px',border:'1.5px solid var(--border)',borderRadius:9,fontFamily:'var(--font)',fontSize:13,marginBottom:10}}>
                <option value="super_admin">Super Admin</option>
                <option value="editor">Editor</option>
              </select>
              <div style={{display:'flex',gap:8}}>
                <button className="btn-primary flex-1" onClick={addAdmin}>যোগ করুন</button>
                <button className="btn-danger" onClick={()=>setShowAddAdmin(false)}>বাতিল</button>
              </div>
            </div>
          )}

          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {adminsList.length===0&&<p style={{color:'var(--muted)',textAlign:'center',padding:20}}>কোনো Admin নেই।</p>}
            {adminsList.map(a=>(
              <div key={a.id} style={{background:'#fff',border:'1.5px solid #e5e7eb',borderRadius:10,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <p style={{fontWeight:700,fontSize:14}}>{a.name||a.id.slice(0,12)+'...'}</p>
                  <p style={{fontSize:12,color:'var(--muted)'}}>{a.id}</p>
                  <span style={{fontSize:11,fontWeight:700,background:a.role==='master'?'#1a7a43':a.role==='super_admin'?'#2980b9':'#888',color:'#fff',padding:'2px 8px',borderRadius:10}}>
                    {a.role==='master'?'👑 Master':a.role==='super_admin'?'⭐ Super Admin':'✏️ Editor'}
                  </span>
                </div>
                {(adminRole==='master'&&a.role!=='master') || (adminRole==='super_admin'&&a.role==='editor') ? (
                  <button onClick={()=>removeAdmin(a.id,a.role)}
                    style={{background:'#fee2e2',color:'#dc2626',border:'none',padding:'6px 12px',borderRadius:8,fontFamily:'var(--font)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    সরান
                  </button>
                ) : a.id===user?.id ? (
                  <span style={{fontSize:11,color:'var(--muted)'}}>আপনি</span>
                ) : null}
              </div>
            ))}
          </div>
        </>)}

        {/* ── ORDERS ── */}
        {adminTab==='orders'&&(<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <h3 className="section-title" style={{marginBottom:0}}>অর্ডার ম্যানেজমেন্ট</h3>
            <button className="btn-refresh" onClick={fetchOrders}>↻ রিফ্রেশ</button>
          </div>
          <div className="order-filters">
            {['All','Pending','Confirmed','On Delivery','Delivered','Cancelled'].map(s=>(
              <button key={s} className={adminFilter===s?'active':''} onClick={()=>setAdminFilter(s)}>{s}</button>
            ))}
          </div>
          {adminLoading?(
            <div className="admin-loading-box"><div className="admin-spinner"/><p>লোড হচ্ছে...</p></div>
          ):adminErr?(
            <div className="admin-error-box">
              {adminErr==='RULES'?(<><p style={{fontWeight:700,marginBottom:8}}>🔒 Firestore Rules সমস্যা</p><div className="rules-code">{`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`}</div><button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}} onClick={fetchOrders}>আবার চেষ্টা</button></>
              ):adminErr==='TIMEOUT'?(<><p style={{fontWeight:700}}>⏱️ সংযোগ ধীর</p><button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}} onClick={fetchOrders}>আবার চেষ্টা</button></>
              ):(<><p style={{fontSize:12}}>{adminErr}</p><button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}} onClick={fetchOrders}>আবার চেষ্টা</button></>)}
            </div>
          ):allOrders.length===0?(
            <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)'}}>
              <p style={{marginBottom:16}}>কোনো অর্ডার নেই।</p>
              <button className="btn-primary" style={{width:'auto',padding:'8px 20px'}} onClick={fetchOrders}>লোড করুন</button>
            </div>
          ):(
            <div className="orders-list">
              {allOrders.filter(o=>adminFilter==='All'||o.status===adminFilter).map(order=>{
                const ss=getStatusStyle(order.status);
                const isCancelledByCustomer=order.cancelledByCustomer===true;
                return(
                  <div key={order.id} style={{background:'#fff',border:`1.5px solid #e5e7eb`,borderRadius:12,padding:16,marginBottom:12,borderLeft:`4px solid ${ss.border}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <strong style={{fontSize:14,color:'#111'}}>#{String(order.id).slice(-6).toUpperCase()}</strong>
                        {isCancelledByCustomer&&<span style={{fontSize:10,background:'#fee2e2',color:'#991b1b',padding:'2px 8px',borderRadius:10,fontWeight:700}}>গ্রাহক বাতিল করেছেন</span>}
                      </div>
                      <span style={{fontSize:12,color:'#6b7280'}}>{order.date}</span>
                    </div>
                    <div style={{background:'#f9fafb',borderRadius:8,padding:'10px 12px',marginBottom:10}}>
                      <p style={{fontSize:13,marginBottom:4}}><b>নাম:</b> {order.userInfo?.name||'—'} &nbsp;|&nbsp; <b>মোবাইল:</b> {order.userInfo?.phone||'—'}</p>
                      <p style={{fontSize:13,marginBottom:4}}><b>ঠিকানা:</b> {order.userInfo?.finalLocation||''}, {order.userInfo?.address||''}, {order.userInfo?.area||''}, {order.userInfo?.district||''}</p>
                      <p style={{fontSize:13,color:'#374151'}}><b>পণ্য:</b> {Array.isArray(order.items)&&order.items.map(i=>`${i.name}(${i.qty}${parseUnit(i.unit).text})`).join(', ')}</p>
                    </div>
                    <p style={{fontSize:13,marginBottom:8}}><b>পেমেন্ট:</b> <span style={{color:'var(--green)',fontWeight:700}}>{order.paymentMethod}</span> &nbsp;|&nbsp; <b>মোট:</b> <span style={{fontWeight:700}}>৳{order.total}</span></p>
                    {(order.paymentMethod==='Bkash'||order.paymentMethod==='Nogod')&&<div style={{background:'#fff8e1',padding:'6px 10px',borderRadius:8,fontSize:12,fontFamily:'monospace',marginBottom:8}}>TrxID: {order.userInfo?.transactionId} | Sender: {order.userInfo?.senderNumber}</div>}
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:13,fontWeight:700,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,padding:'4px 12px',borderRadius:20,whiteSpace:'nowrap'}}>
                        {ss.icon} {order.status}
                      </span>
                      {isCancelledByCustomer ? (
                        <span style={{fontSize:12,color:'#6b7280',flex:1}}>🔒 গ্রাহক বাতিল করেছেন</span>
                      ):(
                        <select style={{flex:1,padding:'7px 10px',borderRadius:9,border:'1.5px solid #d1d5db',fontFamily:'var(--font)',fontSize:13,fontWeight:600,cursor:'pointer',outline:'none'}}
                          value={order.status}
                          onChange={async e=>{
                            try{await updateDoc(doc(db,'orders',order.id),{status:e.target.value});fetchOrders();}
                            catch(err){showToast('আপডেট সমস্যা','error');}
                          }}>
                          <option value="Pending">Pending ⏳</option>
                          <option value="Confirmed">Confirmed ✅</option>
                          <option value="On Delivery">On Delivery 🚚</option>
                          <option value="Delivered">Delivered 🏁</option>
                          <option value="Cancelled">Cancelled ❌</option>
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}
      </div>
    </div>
  );

  // ══════ CUSTOMER VIEW ══════
  const coverStyle=info.coverPhoto
    ?{backgroundImage:`url(${info.coverPhoto})`,backgroundSize:'cover',backgroundPosition:'center'}
    :{background:info.coverGradient||'linear-gradient(135deg,#1a7a43,#27ae60)'};

  return(
    <div className="app-container">
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {verifyBanner&&(
        <div style={{
          position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',
          width:'100%',maxWidth:480,zIndex:9998,
          background: verifyBanner.type==='info'?'#dbeafe':'#fef9c3',
          borderBottom:`2px solid ${verifyBanner.type==='info'?'#3b82f6':'#f59e0b'}`,
          padding:'10px 44px 10px 16px',
          fontSize:13,lineHeight:1.5,color:'#1e3a5f'
        }}>
          {verifyBanner.msg}
          <button onClick={()=>setVerifyBanner(null)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#374151',padding:'0 4px'}}>✕</button>
        </div>
      )}

      {showLogoutConfirm&&(
        <div className="modal-bg" onClick={()=>setShowLogoutConfirm(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'var(--green)',marginBottom:12}}>🚪 লগ আউট করবেন?</h3>
            <p style={{lineHeight:1.6,marginBottom:16}}>{user?.isAnon?'লগ আউট করলে গেস্ট ডেটা মুছে যাবে।':'লগইন করলে আবার সব দেখতে পাবেন।'}</p>
            <div style={{display:'flex',gap:10}}>
              <button className="btn-danger flex-1" onClick={doLogout}>হ্যাঁ, লগ আউট</button>
              <button className="btn-outline flex-1" onClick={()=>setShowLogoutConfirm(false)}>বাতিল</button>
            </div>
          </div>
        </div>
      )}

      {showEmojiPicker&&(
        <div className="modal-bg" onClick={()=>setShowEmojiPicker(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'var(--green)',marginBottom:10}}>প্রোফাইল ইমোজি বেছে নিন</h3>
            <div className="emoji-grid">
              {EMOJIS.map(em=><button key={em} className={`emoji-btn ${info.profileEmoji===em?'active':''}`} onClick={()=>{const upd={...info,profileEmoji:em};setInfo(upd);saveProfile(upd);setShowEmojiPicker(false);}}>{em}</button>)}
            </div>
          </div>
        </div>
      )}

      {showCoverPicker&&(
        <div className="modal-bg" onClick={()=>setShowCoverPicker(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'var(--green)',marginBottom:10}}>কভার বেছে নিন</h3>
            <p style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>ডিফল্ট ডিজাইন:</p>
            <div className="cover-picker-grid">
              {DEFAULT_COVERS.map((g,i)=>(
                <div key={i} className={`cover-pick-item ${!info.coverPhoto&&info.coverGradient===g?'active':''}`}
                  onClick={()=>{const upd={...info,coverPhoto:'',coverGradient:g};setInfo(upd);saveProfile(upd);setShowCoverPicker(false);}}>
                  <div style={{width:'100%',height:60,background:g,borderRadius:6}}/>
                  {!info.coverPhoto&&info.coverGradient===g&&<div className="cover-check">✓</div>}
                </div>
              ))}
            </div>
            {coverPhotos.length>0&&(<><p style={{fontSize:12,color:'var(--muted)',margin:'12px 0 8px'}}>কাস্টম ছবি:</p>
              <div className="cover-picker-grid">
                {coverPhotos.map((url,i)=>(
                  <div key={i} className={`cover-pick-item ${info.coverPhoto===url?'active':''}`}
                    onClick={()=>{const upd={...info,coverPhoto:url};setInfo(upd);saveProfile(upd);setShowCoverPicker(false);}}>
                    <img src={url} alt="" onError={e=>{e.target.src='https://placehold.co/120x60/e8f5e9/27ae60?text=err';}}/>
                    {info.coverPhoto===url&&<div className="cover-check">✓</div>}
                  </div>
                ))}
              </div>
            </>)}
            <button className="btn-outline mt-15" onClick={()=>setShowCoverPicker(false)}>বন্ধ করুন</button>
          </div>
        </div>
      )}

      {showNotifModal&&(
        <div className="modal-bg" onClick={()=>setShowNotifModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'var(--green)',marginBottom:12}}>🔔 নোটিফিকেশন</h3>
            {activeNotifs.length===0?<p style={{color:'var(--muted)'}}>এই মুহূর্তে কোনো নোটিফিকেশন নেই।</p>:(
              activeNotifs.map((n,i)=>(
                <div key={n.id||i} style={{background:'var(--green-pale)',borderRadius:10,padding:'12px 14px',marginBottom:10,borderLeft:'4px solid var(--green)'}}>
                  <p style={{lineHeight:1.6,fontSize:14}}>{n.text}</p>
                  <p style={{fontSize:11,color:'var(--muted)',marginTop:6}}>মেয়াদ: {new Date(n.expiresAt).toLocaleString('bn-BD')}</p>
                </div>
              ))
            )}
            <button className="btn-primary mt-15" onClick={()=>setShowNotifModal(false)}>ঠিক আছে</button>
          </div>
        </div>
      )}

      <div className={`drawer-overlay ${drawer?'active':''}`} onClick={()=>setDrawer(false)}/>
      <div className={`side-drawer ${drawer?'open':''}`}>
        <div className="drawer-head"><span>🌿 সাকিব স্টোর</span><button className="drawer-close" onClick={()=>setDrawer(false)}>✕</button></div>
        <ul className="drawer-menu">
          <li onClick={()=>{goto('home');setDrawer(false);}}>🏠 হোম</li>
          <li onClick={()=>{goto('profile');setDrawer(false);}}>👤 প্রোফাইল</li>
          <li onClick={()=>{window.open('https://eduvibebd.blogspot.com/2026/03/sakibstore.html','_blank');setDrawer(false);}}>🚀 App Update</li>
          <li onClick={()=>{goto('about');setDrawer(false);}}>ℹ️ About Us</li>
          <li className="admin-menu-link" onClick={()=>{setMode('adminLogin');setDrawer(false);}}>🛡️ অ্যাডমিন প্যানেল</li>
        </ul>
      </div>

      {isHome?(
        <header className="main-header" style={{marginTop: verifyBanner?44:0}}>
          <img src={headerImg} alt="header" className="header-bg-img" onError={e=>{e.target.style.display='none';}}/>
          <div className="header-overlay">
            <button className="icon-btn" onClick={()=>setDrawer(true)}>☰</button>
            <div/>
            <button className="icon-btn notif-btn" onClick={()=>setShowNotifModal(true)}>
              🔔{activeNotifs.length>0&&<span className="notif-dot"/>}
            </button>
          </div>
        </header>
      ):(
        <header className="mini-header" style={{marginTop: verifyBanner?44:0}}>
          <button className="icon-btn-dark" onClick={()=>setDrawer(true)}>☰</button>
          <div className="mini-header-title">সাকিব স্টোর</div>
          <button className="icon-btn-dark notif-btn" onClick={()=>setShowNotifModal(true)}>
            🔔{activeNotifs.length>0&&<span className="notif-dot-dark"/>}
          </button>
        </header>
      )}

      <div className="marquee-wrapper"><div className="marquee-track"><span>📢 {notice}&nbsp;&nbsp;&nbsp;&nbsp;📢 {notice}</span></div></div>

      <main className="main-content">

        {/* HOME */}
        {tab==='home'&&(
          <div className="page-home">
            <div className="search-wrapper">
              <input type="text" placeholder="যে কোন কিছু সার্চ করুন..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <span className="search-icon">🔍</span>
              {search&&<button className="search-clear" onClick={()=>setSearch('')}>✕</button>}
            </div>
            <div className="horizontal-categories">
              {CATS.map(c=><button key={c} className={`cat-pill ${homeCat===c?'active':''}`} onClick={()=>{setHomeCat(c);setSearch('');}}>{c}</button>)}
            </div>
            {filtered.length===0?(
              <div className="empty-state text-center mt-30">
                <div style={{fontSize:60,marginBottom:12}}>🔍</div>
                <p>{search?`"${search}" পাওয়া যায়নি`:'এই ক্যাটাগরিতে পণ্য নেই'}</p>
                <button className="btn-primary mt-10" style={{width:'auto',padding:'8px 20px'}} onClick={()=>{setHomeCat('সব পণ্য');setSearch('');}}>সব পণ্য দেখুন</button>
              </div>
            ):(
              <div className="product-grid-3">{filtered.map(p=><PCard key={p.id} p={p}/>)}</div>
            )}
          </div>
        )}

        {/* CATEGORIES */}
        {tab==='categories'&&(
          <div className="page-categories">
            <div className="cat-sidebar">{CATS.map(c=><div key={c} className={`cat-side-item ${catSel===c?'active':''}`} onClick={()=>setCatSel(c)}>{c}</div>)}</div>
            <div className="cat-content">
              <h3 className="cat-title">{catSel}</h3>
              <div className="product-grid-2">{products.filter(p=>catSel==='সব পণ্য'||p.category===catSel).map(p=><PCard key={p.id} p={p}/>)}</div>
            </div>
          </div>
        )}

        {/* CART */}
        {tab==='cart'&&(
          <div className="page-cart">
            <h2 className="section-title text-center">আপনার কার্ট 🛒</h2>
            {cart.length===0?(
              <div className="empty-state text-center mt-30"><div style={{fontSize:60,marginBottom:12}}>🛒</div><p>কার্ট খালি!</p><button className="btn-primary mt-10" onClick={()=>goto('home')}>পণ্য বাছাই করুন</button></div>
            ):(
              <div className="cart-checkout-wrapper">
                <div className="cart-items-list">
                  {cart.map(item=>(
                    <div key={item.id} className="cart-item">
                      <img src={item.image||'https://placehold.co/50x50/e8f5e9/27ae60?text=P'} alt={item.name} className="cart-item-img"/>
                      <div className="c-info"><strong>{item.name}</strong><p style={{fontSize:12,color:'var(--muted)'}}>{bn(item.qty)}{parseUnit(item.unit).text}</p></div>
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
                    {DLOCS.map(loc=><button key={loc} className={`select-box ${info.locationType===loc?'active':''}`} onClick={()=>setInfo({...info,locationType:loc})}>{loc}{loc!=='নিজে লেখুন'&&<span className="charge-hint">৳{getDC(loc)}</span>}</button>)}
                  </div>
                  {info.locationType==='নিজে লেখুন'&&<input type="text" className="custom-input mt-10" placeholder="জায়গার নাম লিখুন..." value={customLoc} onChange={e=>setCustomLoc(e.target.value)}/>}
                  <h3 className="sub-title mt-20">🚚 ডেলিভারি তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম *" value={info.name} onChange={e=>setInfo({...info,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর *" value={info.phone} onChange={e=>setInfo({...info,phone:e.target.value})}/>
                    <div style={{display:'flex',gap:10}}>
                      <input type="text" placeholder="জেলা *" value={info.district} onChange={e=>setInfo({...info,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা *" value={info.area} onChange={e=>setInfo({...info,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং *" value={info.address} onChange={e=>setInfo({...info,address:e.target.value})}/>
                  </div>
                  <h3 className="sub-title mt-20">💳 পেমেন্ট পদ্ধতি</h3>
                  <div className="selector-grid cols-3">
                    {['Bkash','Nogod','Cash on Delivery'].map(pm=><button key={pm} className={`select-box payment-box ${info.paymentMethod===pm?'active':''}`} onClick={()=>setInfo({...info,paymentMethod:pm})}>{pm==='Bkash'?'💗 Bkash':pm==='Nogod'?'🔴 Nogod':'💵 CoD'}</button>)}
                  </div>
                  {(info.paymentMethod==='Bkash'||info.paymentMethod==='Nogod')&&(
                    <div className="payment-instructions mt-10">
                      <p className="pay-number">📲 Personal: <strong>01723539738</strong></p>
                      <p style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>উপরের নম্বরে Send Money করুন:</p>
                      <input type="number" placeholder="যে নম্বর থেকে পাঠিয়েছেন *" value={info.senderNumber} onChange={e=>setInfo({...info,senderNumber:e.target.value})} className="mb-10"/>
                      <input type="text" placeholder="Transaction ID *" value={info.transactionId} onChange={e=>setInfo({...info,transactionId:e.target.value})}/>
                    </div>
                  )}
                  <div className="bill-summary mt-20">
                    <div className="bill-row"><span>পণ্যের দাম:</span><span>৳{bn(cartTotal)}</span></div>
                    <div className="bill-row"><span>ডেলিভারি:</span><span>৳{bn(dCharge)}</span></div>
                    <div className="bill-row total"><span>মোট বিল:</span><span>৳{bn(finalTotal)}</span></div>
                  </div>
                  <button className="btn-confirm-order mt-20" onClick={submitOrder}>✅ অর্ডার নিশ্চিত করুন (৳{bn(finalTotal)})</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROFILE */}
        {tab==='profile'&&(
          <div className="page-profile">
            {!user?(
              <div className="auth-screen text-center">
                <div style={{fontSize:64,marginBottom:12}}>🛒</div>
                <h2 className="mb-10">লগইন করুন</h2>

                {authMode==='choice'&&(<>
                  <p style={{color:'var(--muted)',marginBottom:20,fontSize:14}}>অর্ডার ট্র্যাক ও তথ্য সেভ করতে লগইন করুন।</p>
                  <button className="btn-google mb-10" onClick={googleLogin} disabled={authLoading}>
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" width="20"/>
                    {authLoading?'লোড হচ্ছে...':'Google দিয়ে লগইন'}
                  </button>
                  <button className="btn-email mb-10" onClick={()=>setAuthMode('email-login')}>📧 ইমেইল দিয়ে লগইন</button>
                  <button className="btn-email-reg mb-10" onClick={()=>setAuthMode('email-register')}>✏️ নতুন অ্যাকাউন্ট তৈরি করুন</button>
                  <div className="divider">অথবা</div>
                  <button className="btn-outline mt-10" onClick={guestLogin}>👤 গেস্ট হিসেবে প্রবেশ করুন</button>
                  <p style={{color:'var(--muted)',marginTop:15,fontSize:12}}>Google/Email লগইন করলে ডেটা চিরস্থায়ী থাকে।</p>
                </>)}

                {authMode==='email-login'&&(
                  <div style={{width:'100%',maxWidth:300}}>
                    <p style={{color:'var(--muted)',marginBottom:15,fontSize:14}}>ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন</p>
                    <input type="email" placeholder="ইমেইল" value={emailInput} onChange={e=>setEmailInput(e.target.value)} className="auth-input mb-10"/>
                    <input type="password" placeholder="পাসওয়ার্ড" value={passInput} onChange={e=>setPassInput(e.target.value)} className="auth-input mb-15" onKeyDown={e=>{if(e.key==='Enter')emailLogin();}}/>
                    <button className="btn-primary mb-10" onClick={emailLogin} disabled={authLoading}>{authLoading?'লোড...':'লগইন করুন'}</button>
                    <button className="btn-outline" onClick={()=>{setAuthMode('choice');setEmailInput('');setPassInput('');}}>← ফিরে যান</button>
                  </div>
                )}

                {authMode==='email-register'&&(
                  <div style={{width:'100%',maxWidth:300}}>
                    <p style={{color:'var(--muted)',marginBottom:15,fontSize:14}}>নতুন অ্যাকাউন্ট তৈরি করুন</p>
                    <input type="text" placeholder="আপনার নাম" value={nameInput} onChange={e=>setNameInput(e.target.value)} className="auth-input mb-10"/>
                    <input type="email" placeholder="ইমেইল" value={emailInput} onChange={e=>setEmailInput(e.target.value)} className="auth-input mb-10"/>
                    <input type="password" placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)" value={passInput} onChange={e=>setPassInput(e.target.value)} className="auth-input mb-15"/>
                    <button className="btn-primary mb-10" onClick={emailRegister} disabled={authLoading}>{authLoading?'তৈরি হচ্ছে...':'অ্যাকাউন্ট তৈরি করুন'}</button>
                    <button className="btn-outline" onClick={()=>{setAuthMode('choice');setEmailInput('');setPassInput('');setNameInput('');}}>← ফিরে যান</button>
                  </div>
                )}
              </div>
            ):(
              <div className="profile-dashboard">
                <div className="profile-header-box">
                  <div className="cover-photo" style={coverStyle}>
                    <button className="cover-change-btn" onClick={()=>{loadSettings();setShowCoverPicker(true);}}>🖼️ কভার পরিবর্তন</button>
                  </div>
                  <div className="avatar-section">
                    <div className="avatar-emoji" onClick={()=>setShowEmojiPicker(true)}>
                      <span className="avatar-emoji-icon">{info.profileEmoji||'👤'}</span>
                      <div className="avatar-edit-hint">✏️</div>
                    </div>
                    <div className="user-titles">
                      <h3>{info.name||(user.isAnon?'গেস্ট ইউজার':user.name||'নাম দিন')}</h3>
                      <p>{user.email||(user.isAnon?'Guest Account':'')}</p>
                      {user.email&&!user.isAnon&&!user.emailVerified&&<p style={{fontSize:11,color:'#d97706',fontWeight:600}}>⚠️ ইমেইল ভেরিফাই করুন</p>}
                    </div>
                  </div>
                </div>
                <div style={{padding:'0 16px'}}>
                  <h3 className="sub-title mt-20">✏️ আপনার তথ্য</h3>
                  <div className="form-group">
                    <input type="text" placeholder="আপনার নাম" value={info.name} onChange={e=>setInfo({...info,name:e.target.value})}/>
                    <input type="number" placeholder="মোবাইল নম্বর" value={info.phone} onChange={e=>setInfo({...info,phone:e.target.value})}/>
                    <div style={{display:'flex',gap:10}}>
                      <input type="text" placeholder="জেলা" value={info.district} onChange={e=>setInfo({...info,district:e.target.value})}/>
                      <input type="text" placeholder="থানা/উপজেলা" value={info.area} onChange={e=>setInfo({...info,area:e.target.value})}/>
                    </div>
                    <textarea placeholder="গ্রাম/রোড/বাড়ি নং" value={info.address} onChange={e=>setInfo({...info,address:e.target.value})}/>
                    <button className="btn-primary mt-10" onClick={()=>saveProfile()}>💾 তথ্য সেভ করুন</button>
                  </div>
                </div>

                <div style={{padding:'0 16px',marginTop:20}}>
                  <h3 className="sub-title">📦 আপনার অর্ডার ({userOrders.length})</h3>
                  {userOrders.length===0?<p style={{color:'var(--muted)'}}>কোনো অর্ডার নেই।</p>:(
                    userOrders.map(o=>{
                      const ss=getStatusStyle(o.status);
                      const isExpanded=expandedOrder===o.id;
                      const isCancelledByCustomer=o.cancelledByCustomer===true;
                      return(
                        <div key={o.id} style={{background:'#fff',border:'1.5px solid #e5e7eb',borderRadius:12,marginBottom:10,overflow:'hidden',borderLeft:`4px solid ${ss.border}`}}>
                          <div style={{padding:'12px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>setExpandedOrder(isExpanded?null:o.id)}>
                            <div>
                              <strong style={{fontSize:13}}>Order #{String(o.id).slice(-6).toUpperCase()}</strong>
                              <p style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{o.date}</p>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <span style={{fontSize:12,fontWeight:700,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,padding:'3px 10px',borderRadius:14}}>
                                {ss.icon} {o.status}
                              </span>
                              <span style={{fontSize:11,color:'var(--muted)'}}>{isExpanded?'▲':'▼'}</span>
                            </div>
                          </div>
                          <div style={{paddingLeft:14,paddingRight:14,paddingBottom:isExpanded?0:12}}>
                            <p style={{fontSize:13,color:'#374151'}}>
                              <b>পণ্য:</b> {Array.isArray(o.items)&&o.items.slice(0,2).map(i=>`${i.name}(${i.qty})`).join(', ')}
                              {o.items?.length>2&&` এবং আরও ${o.items.length-2}টি`}
                            </p>
                            <p style={{fontSize:13,fontWeight:700,color:'var(--green)',marginTop:4}}>মোট: ৳{bn(o.total)}</p>
                          </div>
                          {isExpanded&&(
                            <div style={{borderTop:'1px dashed #e5e7eb',padding:'12px 14px',background:'#fafafa'}}>
                              {Array.isArray(o.items)&&o.items.map((item,i)=>(
                                <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',borderBottom:'1px dashed #f0f0f0'}}>
                                  <span>{item.name} × {item.qty}{parseUnit(item.unit).text}</span>
                                  <span style={{fontWeight:600}}>৳{bn((item.price/parseUnit(item.unit).baseQty)*item.qty)}</span>
                                </div>
                              ))}
                              <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,marginTop:8,marginBottom:4}}>
                                <span>মোট বিল:</span><span style={{color:'var(--green)'}}>৳{bn(o.total)}</span>
                              </div>
                              <p style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>পেমেন্ট: {o.paymentMethod} | ডেলিভারি: {o.userInfo?.finalLocation}</p>
                              {o.status==='Pending'&&!isCancelledByCustomer&&(
                                <button onClick={()=>cancelOrder(o.id)}
                                  style={{width:'100%',padding:'8px',background:'#fff',border:'1.5px solid #ef4444',borderRadius:8,color:'#ef4444',fontFamily:'var(--font)',fontSize:13,fontWeight:700,cursor:'pointer',marginTop:4}}>
                                  ❌ অর্ডার বাতিল করুন
                                </button>
                              )}
                              {isCancelledByCustomer&&<p style={{fontSize:12,color:'#6b7280',marginTop:6,textAlign:'center'}}>আপনি এই অর্ডারটি বাতিল করেছেন।</p>}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div style={{padding:'0 16px'}}>
                  <button className="btn-danger w-full mt-20" onClick={confirmLogout}>🚪 লগ আউট করুন</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABOUT (সরাসরি এডমিন প্যানেল লজিক অ্যাড করা হয়েছে) */}
        {tab==='about'&&(
          <div className="about-view"
            onClick={()=>{
              const n=aboutClicks+1;setAboutClicks(n);
              if(n>=7){
                setAboutClicks(0);
                if(adminRole && adminRole !== 'customer') {
                  setMode('admin');
                  setAdminTab('stock');
                } else {
                  setMode('adminLogin');
                }
              }
            }}>
            <h2 style={{color:'var(--green)',marginBottom:20}}>About Us</h2>
            <div style={{fontSize:64,marginBottom:8}}>🌿</div>
            <h3 style={{marginBottom:10}}>সাকিব স্টোর</h3>
            <p className="about-desc">সাকিব স্টোর একটি বিশ্বস্ত অনলাইন গ্রোসারি শপ। সাশ্রয়ী মূল্যে ফ্রেশ পণ্য আপনাদের দুয়ারে পৌঁছে দেই।</p>
            <div className="contact-box mt-30">
              <p className="contact-title">📞 যোগাযোগ:</p>
              <p>০১৭২৪৪০৯২১৯</p><p>০১৭৩৫৩৭৬০৭৯</p><p>০১৭২৩৫৩৯৭৩৮</p>
            </div>
          </div>
        )}
      </main>

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

export default function App(){return<ErrorBoundary><AppInner/></ErrorBoundary>;}

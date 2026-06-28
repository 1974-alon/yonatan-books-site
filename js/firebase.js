/* =========================================================
   Firebase — app init + Storage
   Future: add Auth, Firestore here as they are enabled
========================================================= */

const firebaseConfig = {
  apiKey:            'AIzaSyASzDKofwp7XP_1U8E18j0PaPxu4IGIWlg',
  authDomain:        'yonatan-books.firebaseapp.com',
  projectId:         'yonatan-books',
  storageBucket:     'yonatan-books.firebasestorage.app',
  messagingSenderId: '546232639320',
  appId:             '1:546232639320:web:91fa7f1e0dfa240f468f2d'
};

firebase.initializeApp(firebaseConfig);
window.ybStorage = firebase.storage();

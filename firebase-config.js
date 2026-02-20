// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBRjA6kWFAkugFUrZWF7ojx7fqQAeu8TAA",
  authDomain: "e-s-recipes.firebaseapp.com",
  projectId: "e-s-recipes",
  storageBucket: "e-s-recipes.firebasestorage.app",
  messagingSenderId: "983679762983",
  appId: "1:983679762983:web:219412952e4023d3650402",
  measurementId: "G-T8FMN583SQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
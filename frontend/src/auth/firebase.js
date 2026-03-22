import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// AgriSense AI Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAPPfwdiyAG_CK2r1wc36ReeBvkkgi4pb8",
  authDomain: "agrisense-a3170.firebaseapp.com",
  projectId: "agrisense-a3170",
  storageBucket: "agrisense-a3170.firebasestorage.app",
  messagingSenderId: "512955583191",
  appId: "1:512955583191:web:e31a382523d07d9dedbe92",
  measurementId: "G-X59XCJRE8Z"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        // Save to localStorage for our existing backend logic
        localStorage.setItem('agrisense_user_email', user.email);
        localStorage.setItem('agrisense_user_name', user.displayName);
        localStorage.setItem('agrisense_user_photo', user.photoURL);
        
        return user;
    } catch (error) {
        console.error("Error signing in with Google", error);
        throw error;
    }
};

export const logout = async () => {
    try {
        await signOut(auth);
        localStorage.removeItem('agrisense_user_email');
        localStorage.removeItem('agrisense_user_name');
        localStorage.removeItem('agrisense_user_photo');
    } catch (error) {
        console.error("Error signing out", error);
        throw error;
    }
};

export { auth };

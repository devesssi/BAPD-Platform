import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider,useAuth } from '@clerk/react';
import App from './App.jsx';
import './style.css';

const key=import.meta.env.VITE_CLERK_PUBLISHABLE_KEY||import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
function ClerkBridge(){const {getToken,isLoaded,isSignedIn}=useAuth();React.useEffect(()=>{window.bapdGetToken=isSignedIn?getToken:null;if(isLoaded)window.dispatchEvent(new Event('bapd-auth-ready'));return()=>{delete window.bapdGetToken}},[getToken,isLoaded,isSignedIn]);return null}
createRoot(document.getElementById('root')).render(key?<ClerkProvider publishableKey={key}><ClerkBridge/><App clerkEnabled /></ClerkProvider>:<App clerkEnabled={false}/>);

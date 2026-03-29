import React from 'react';

export default function Signup() {
  return (
    <>
      <link rel="stylesheet" href="/globals.css" />
      <div dangerouslySetInnerHTML={{ __html: `
        <div class="auth-container">
           <h2>Join Blink</h2>
           <form id="signupForm">
              <input type="email" id="email" placeholder="Email" required />
              <input type="password" id="password" placeholder="Password" required />
              <button type="submit" class="auth-btn">Sign Up</button>
           </form>
           <p style="text-align:center; margin-top:20px;">
             Already have an account? <a href="/login" style="color:#00ff88;">Login</a>
           </p>
        </div>
      ` }} />

      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('signupForm').addEventListener('submit', async (e) => {
           e.preventDefault();
           const email = document.getElementById('email').value;
           const password = document.getElementById('password').value;
           
           const res = await fetch('http://localhost:5000/api/auth/signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
           });
           
           const data = await res.json();
           if (res.ok) {
              localStorage.setItem('blink_token', data.token);
              localStorage.setItem('blink_user', data.userId);
              window.location.href = '/';
           } else {
              alert('Sign up failed: ' + data.error);
           }
        });
      ` }} />
    </>
  );
}

import React from 'react';

export default function Login() {
  return (
    <>
      <link rel="stylesheet" href="/globals.css" />
      <div dangerouslySetInnerHTML={{ __html: `
        <div class="auth-container">
           <h2>Login to Blink</h2>
           <form id="loginForm">
              <input type="email" id="email" placeholder="Email" required />
              <input type="password" id="password" placeholder="Password" required />
              <button type="submit" class="auth-btn">Login</button>
           </form>
           <p style="text-align:center; margin-top:20px;">
             Don't have an account? <a href="/signup" style="color:#00ff88;">Sign Up</a>
           </p>
        </div>
      ` }} />

      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
           e.preventDefault();
           const email = document.getElementById('email').value;
           const password = document.getElementById('password').value;
           
           const res = await fetch('http://localhost:5000/api/auth/login', {
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
              alert('Login failed: ' + data.error);
           }
        });
      ` }} />
    </>
  );
}

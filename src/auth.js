import { getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'
import { firebaseConfig } from './firebase-config.js'

class FirebaseAuthService {
  constructor() {
    this.configured = Boolean(
      firebaseConfig.apiKey
      && firebaseConfig.authDomain
      && firebaseConfig.projectId
      && firebaseConfig.appId
    )

    if (this.configured) {
      const app = getApps()[0] || initializeApp(firebaseConfig)
      this.auth = getAuth(app)
    }
  }

  observe(callback) {
    return onAuthStateChanged(this.auth, callback)
  }

  signUp(email, password) {
    return createUserWithEmailAndPassword(this.auth, email, password)
  }

  signIn(email, password) {
    return signInWithEmailAndPassword(this.auth, email, password)
  }

  logout() {
    return signOut(this.auth)
  }
}

class AuthView {
  constructor(service) {
    this.service = service
    this.signUpMode = true
    this.isGuest = localStorage.getItem('frzi_guest_session') === 'true'
    this.app = document.querySelector('.app-shell')
    this.app.hidden = !this.isGuest
    this.createView()
    this.createLogoutButton()
  }

  createView() {
    this.view = document.createElement('section')
    this.view.className = 'auth-view'
    this.view.hidden = this.isGuest
    this.view.innerHTML = `
      <div class="auth-card spectrum-Card">
        <div class="auth-brand">
          <span>F</span>
          <strong class="spectrum-Heading spectrum-Heading--sizeXS">Freznel</strong>
        </div>
        <h1 id="authTitle" class="spectrum-Heading spectrum-Heading--sizeL">Create your account</h1>
        <p id="authSubtitle" class="spectrum-Body spectrum-Body--sizeS">Sign up to explore and compare AI models.</p>
        <form id="authForm">
          <label class="spectrum-FieldLabel spectrum-FieldLabel--sizeM" for="authEmail">Email address</label>
          <div class="spectrum-Textfield">
            <input id="authEmail" class="spectrum-Textfield-input" type="email" autocomplete="email" required />
          </div>
          <label class="spectrum-FieldLabel spectrum-FieldLabel--sizeM" for="authPassword">Password</label>
          <div class="spectrum-Textfield">
            <input id="authPassword" class="spectrum-Textfield-input" type="password" minlength="6" autocomplete="new-password" required />
          </div>
          <p id="authError" class="auth-error" hidden></p>
          <button id="authSubmit" class="spectrum-Button spectrum-Button--fill spectrum-Button--accent auth-submit" type="submit">
            <span class="spectrum-Button-label">Create account</span>
          </button>
        </form>
        <button id="authToggle" class="spectrum-Link link-button auth-toggle" type="button">Already have an account? Sign in</button>
        <div class="auth-divider"><span>or</span></div>
        <button id="authGuest" class="spectrum-Button spectrum-Button--fill spectrum-Button--secondary auth-guest" type="button">
          <span class="spectrum-Button-label">Continue as Guest</span>
        </button>
      </div>
    `
    document.body.prepend(this.view)
    this.form = this.view.querySelector('#authForm')
    this.email = this.view.querySelector('#authEmail')
    this.password = this.view.querySelector('#authPassword')
    this.error = this.view.querySelector('#authError')
    this.submitButton = this.view.querySelector('#authSubmit')
    this.submitLabel = this.view.querySelector('#authSubmit .spectrum-Button-label')
    this.toggleButton = this.view.querySelector('#authToggle')
    this.guestButton = this.view.querySelector('#authGuest')
    this.title = this.view.querySelector('#authTitle')
    this.subtitle = this.view.querySelector('#authSubtitle')
  }

  createLogoutButton() {
    const badge = document.querySelector('#connectionBadge')
    const actions = document.createElement('div')
    const button = document.createElement('button')
    actions.className = 'header-actions'
    button.id = 'logoutButton'
    button.className = 'spectrum-Button spectrum-Button--fill spectrum-Button--secondary logout-button'
    button.type = 'button'
    button.innerHTML = '<span class="spectrum-Button-label">Sign out</span>'
    badge.parentElement.replaceChild(actions, badge)
    actions.append(badge, button)
    this.logoutButton = button
  }

  start() {
    this.form.addEventListener('submit', event => this.submit(event))
    this.toggleButton.addEventListener('click', () => this.toggleMode())
    this.guestButton.addEventListener('click', () => this.enterGuestMode())
    this.logoutButton.addEventListener('click', () => this.logout())

    if (!this.service.configured) {
      if (!this.isGuest) {
        this.showError('Add your Firebase values in src/firebase-config.js, or continue as Guest.')
      }
      return
    }

    this.service.observe(user => {
      if (this.isGuest) return
      this.view.hidden = Boolean(user)
      this.app.hidden = !user
    })
  }

  enterGuestMode() {
    this.isGuest = true
    localStorage.setItem('frzi_guest_session', 'true')
    this.error.hidden = true
    this.view.hidden = true
    this.app.hidden = false
  }

  logout() {
    if (this.isGuest) {
      this.isGuest = false
      localStorage.removeItem('frzi_guest_session')
      this.view.hidden = false
      this.app.hidden = true
      return
    }
    this.service.logout()
  }

  toggleMode() {
    this.signUpMode = !this.signUpMode
    this.error.hidden = true
    this.title.textContent = this.signUpMode ? 'Create your account' : 'Welcome back'
    this.subtitle.textContent = this.signUpMode
      ? 'Sign up to explore and compare AI models.'
      : 'Sign in to continue to the model selector.'
    this.submitLabel.textContent = this.signUpMode ? 'Create account' : 'Sign in'
    this.toggleButton.textContent = this.signUpMode
      ? 'Already have an account? Sign in'
      : 'New user? Create an account'
    this.password.autocomplete = this.signUpMode ? 'new-password' : 'current-password'
  }

  submit(event) {
    event.preventDefault()
    this.error.hidden = true
    this.submitButton.disabled = true
    this.submitLabel.textContent = this.signUpMode ? 'Creating account...' : 'Signing in...'

    const request = this.signUpMode
      ? this.service.signUp(this.email.value.trim(), this.password.value)
      : this.service.signIn(this.email.value.trim(), this.password.value)

    request
      .catch(error => this.showError(this.errorMessage(error.code)))
      .finally(() => {
        this.submitButton.disabled = false
        this.submitLabel.textContent = this.signUpMode ? 'Create account' : 'Sign in'
      })
  }

  showError(message) {
    this.error.textContent = message
    this.error.hidden = false
  }

  errorMessage(code) {
    const messages = {
      'auth/email-already-in-use': 'This email is already registered. Click "Already have an account? Sign in" below.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/weak-password': 'Password must contain at least 6 characters.',
      'auth/network-request-failed': 'Check your internet connection, or continue as Guest.'
    }

    return messages[code] || 'Authentication failed. Please try again.'
  }
}

new AuthView(new FirebaseAuthService()).start()

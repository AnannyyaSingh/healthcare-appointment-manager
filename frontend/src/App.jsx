import React, { useState, useEffect, useRef } from 'react';

// API Base URL
const API_URL = 'http://localhost:5000/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login'); // login, patient, doctor, admin
  const [toasts, setToasts] = useState([]);
  const [activeTab, setActiveTab] = useState('default');

  // Loading state
  const [loading, setLoading] = useState(false);

  // Authentication check on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setPage(parsedUser.role);
    }
  }, []);

  // Helper to show toasts
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setPage('login');
    showToast('Logged out successfully', 'success');
  };

  return (
    <div className="app-container">
      {/* Toast Alert System */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'}</span>
            <div>{t.message}</div>
          </div>
        ))}
      </div>

      {/* Navigation Header */}
      {user && (
        <nav className="navbar">
          <div className="nav-logo" onClick={() => setPage(user.role)}>
            <span className="nav-logo-icon">🎛️</span> Clinic Care Manager
          </div>
          <div className="nav-links">
            <span className="nav-user">
              👤 {user.name} ({user.role.toUpperCase()})
            </span>
            <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '0.4rem 1rem' }}>
              Logout
            </button>
          </div>
        </nav>
      )}

      <main className="main-content">
        {page === 'login' && (
          <LoginPortal 
            setUser={setUser} 
            setPage={setPage} 
            showToast={showToast} 
            setLoading={setLoading}
          />
        )}
        {page === 'patient' && user && (
          <PatientPortal 
            user={user} 
            showToast={showToast} 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        )}
        {page === 'doctor' && user && (
          <DoctorPortal 
            user={user} 
            showToast={showToast}
          />
        )}
        {page === 'admin' && user && (
          <AdminPortal 
            user={user} 
            showToast={showToast}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        )}
      </main>
    </div>
  );
}

/* ==========================================================================
   LOGIN & REGISTER COMPONENT
   ========================================================================== */
function LoginPortal({ setUser, setPage, showToast, setLoading }) {
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('patient'); // patient, doctor, (admin is seed-only)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || (isRegister && !name)) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    setLoading(true);
    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    const body = isRegister ? { name, email, password, role } : { email, password };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server request failed');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setUser(data.user);
      setPage(data.user.role);
      showToast(`Welcome back, ${data.user.name}!`, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <h2 className="auth-title">{isRegister ? 'Create Account' : 'Welcome back'}</h2>
          <p className="auth-subtitle">
            {isRegister ? 'Register your patient or doctor portal profile' : 'Sign in to access your clinic portal'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="role-selector">
              <div 
                className={`role-option ${role === 'patient' ? 'active' : ''}`}
                onClick={() => setRole('patient')}
              >
                Patient
              </div>
              <div 
                className={`role-option ${role === 'doctor' ? 'active' : ''}`}
                onClick={() => setRole('doctor')}
              >
                Doctor
              </div>
            </div>
          )}

          {isRegister && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="John Doe" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="name@clinic.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
            {isRegister ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isRegister ? 'Already have an account? ' : "Don't have a patient account? "}
          </span>
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); setIsRegister(!isRegister); }}
            style={{ color: 'var(--color-secondary)', fontWeight: 600, textDecoration: 'none' }}
          >
            {isRegister ? 'Sign In' : 'Sign Up'}
          </a>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   PATIENT DASHBOARD PORTAL
   ========================================================================== */
function PatientPortal({ user, showToast, activeTab, setActiveTab }) {
  const [tab, setTab] = useState(activeTab === 'default' ? 'book' : activeTab);
  const [doctors, setDoctors] = useState([]);
  const [selectedSpecialisation, setSelectedSpecialisation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Slot selection and holds
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [holdExpiry, setHoldExpiry] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Symptoms submission
  const [showSymptomModal, setShowSymptomModal] = useState(false);
  const [symptoms, setSymptoms] = useState('');

  // Appointments
  const [appointments, setAppointments] = useState([]);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Timer Ref
  const timerRef = useRef(null);

  // Initial load
  useEffect(() => {
    fetchDoctors();
    fetchAppointments();
  }, []);

  // Sync tab back
  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  // Hold Timer logic
  useEffect(() => {
    if (holdExpiry) {
      const calculateTimeLeft = () => {
        const diff = Math.max(0, Math.round((holdExpiry - Date.now()) / 1000));
        setSecondsLeft(diff);
        if (diff === 0) {
          setHoldExpiry(null);
          setSelectedSlot(null);
          showToast('Slot hold expired. Please select a slot again.', 'error');
          if (selectedDoc && selectedDate) {
            fetchSlots(selectedDoc.id, selectedDate);
          }
        }
      };
      
      calculateTimeLeft();
      timerRef.current = setInterval(calculateTimeLeft, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [holdExpiry]);

  const fetchDoctors = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/patient/doctors`;
      const queryParams = [];
      if (selectedSpecialisation) queryParams.push(`specialisation=${selectedSpecialisation}`);
      if (searchTerm) queryParams.push(`search=${searchTerm}`);
      if (queryParams.length) url += `?${queryParams.join('&')}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDoctors(data);
    } catch (err) {
      showToast('Failed to load doctors: ' + err.message, 'error');
    }
  };

  const fetchAppointments = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/patient/appointments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAppointments(data);
    } catch (err) {
      showToast('Failed to load appointments: ' + err.message, 'error');
    }
  };

  const fetchSlots = async (docId, dateStr) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/patient/doctors/${docId}/slots?date=${dateStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSlots(data.slots || []);
      if (data.message) {
        showToast(data.message, 'info');
      }
    } catch (err) {
      showToast('Failed to load slots: ' + err.message, 'error');
    }
  };

  const handleDoctorSelect = (doc) => {
    setSelectedDoc(doc);
    setSelectedSlot(null);
    setHoldExpiry(null);
    setSlots([]);
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomStr = tomorrow.toISOString().substring(0, 10);
    setSelectedDate(tomStr);
    fetchSlots(doc.id, tomStr);
  };

  const handleDateChange = (e) => {
    const d = e.target.value;
    setSelectedDate(d);
    setSelectedSlot(null);
    setHoldExpiry(null);
    if (selectedDoc) {
      fetchSlots(selectedDoc.id, d);
    }
  };

  const handleSlotHold = async (slotTime) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/patient/slots/hold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          doctor_id: selectedDoc.id,
          date: selectedDate,
          time: slotTime
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedSlot(slotTime);
      setHoldExpiry(data.expires_at);
      showToast('Slot locked for 5 minutes. Fill symptoms to complete booking.', 'success');
      // Refresh slots status
      fetchSlots(selectedDoc.id, selectedDate);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!symptoms.trim()) {
      showToast('Please describe your symptoms briefly.', 'error');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/patient/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          doctor_id: selectedDoc.id,
          date: selectedDate,
          time: selectedSlot,
          symptoms: symptoms
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Appointment booked successfully!', 'success');
      setShowSymptomModal(false);
      setSelectedSlot(null);
      setHoldExpiry(null);
      setSymptoms('');
      fetchAppointments();
      setTab('my-appts');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCancelAppointment = async (apptId) => {
    if (!confirm('Are you sure you want to cancel this appointment? This will notify the doctor and clear your schedule.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/patient/appointments/${apptId}/cancel`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Appointment cancelled successfully.', 'success');
      fetchAppointments();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openSummary = (appt) => {
    setSelectedAppt(appt);
    setShowSummaryModal(true);
  };

  const getUrgencyClass = (lvl) => {
    if (lvl === 'High') return 'badge-high';
    if (lvl === 'Medium') return 'badge-medium';
    return 'badge-low';
  };

  return (
    <div>
      <div className="dashboard-header">
        <h2 className="dashboard-title">
          Patient Portal
          <span>Book appointments, view AI pre-visit summaries, prescriptions and medication schedules.</span>
        </h2>
      </div>

      <div className="tabs-header">
        <button 
          className={`tab-btn ${tab === 'book' ? 'active' : ''}`}
          onClick={() => setTab('book')}
        >
          📅 Book Consultation
        </button>
        <button 
          className={`tab-btn ${tab === 'my-appts' ? 'active' : ''}`}
          onClick={() => setTab('my-appts')}
        >
          📋 My Appointments ({appointments.length})
        </button>
      </div>

      {/* TAB 1: BOOK CONSULTATION */}
      {tab === 'book' && (
        <div className="grid-2">
          {/* Left panel: Search & Doctors List */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Search Doctors</h3>
            <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '1.25rem' }}>
              <select 
                className="form-select"
                value={selectedSpecialisation}
                onChange={(e) => setSelectedSpecialisation(e.target.value)}
              >
                <option value="">All Specialisations</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="General Medicine">General Medicine</option>
                <option value="Dermatology">Dermatology</option>
              </select>
              <input 
                type="text"
                className="form-input"
                placeholder="Doctor name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={fetchDoctors} style={{ width: '100%', marginBottom: '1.5rem' }}>
              Filter Doctors
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {doctors.map(doc => (
                <div 
                  key={doc.id}
                  className={`glass-panel ${selectedDoc?.id === doc.id ? 'selected' : ''}`}
                  onClick={() => handleDoctorSelect(doc)}
                  style={{
                    padding: '1rem',
                    cursor: 'pointer',
                    borderLeft: selectedDoc?.id === doc.id ? '4px solid var(--color-secondary)' : '1px solid var(--border-color)'
                  }}
                >
                  <h4 style={{ color: '#fff' }}>{doc.name}</h4>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>🔬 {doc.specialisation}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>🕒 Working hours: {doc.working_start} - {doc.working_end}</p>
                </div>
              ))}
              {doctors.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No doctors found.</p>
              )}
            </div>
          </div>

          {/* Right panel: Scheduling & Booking */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            {selectedDoc ? (
              <div>
                <h3 style={{ marginBottom: '1rem' }}>Schedule with {selectedDoc.name}</h3>
                <div className="form-group">
                  <label className="form-label">Select Consultation Date</label>
                  <input 
                    type="date"
                    className="form-input"
                    value={selectedDate}
                    min={new Date().toISOString().substring(0, 10)}
                    onChange={handleDateChange}
                  />
                </div>

                {/* Slot hold countdown indicator */}
                {holdExpiry && (
                  <div className={`hold-timer ${secondsLeft < 60 ? 'danger' : ''}`}>
                    ⏳ Hold Expiry: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                  </div>
                )}

                <div className="slots-container">
                  <h4 style={{ marginBottom: '0.5rem' }}>Available Time Slots</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Note: Slots marked in green are held by you. Select a slot to hold it, then fill symptoms.
                  </p>
                  
                  <div className="slots-grid">
                    {slots.map(slot => (
                      <button
                        key={slot.time}
                        className={`slot-btn ${slot.status === 'held_by_me' || selectedSlot === slot.time ? 'selected' : ''}`}
                        disabled={slot.status === 'booked' || slot.status === 'held'}
                        onClick={() => handleSlotHold(slot.time)}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>

                  {slots.length === 0 && (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
                      No available slots on this date or doctor is on leave.
                    </p>
                  )}
                </div>

                {selectedSlot && (
                  <div style={{ marginTop: '2rem' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => setShowSymptomModal(true)}
                      style={{ width: '100%' }}
                    >
                      ✏️ Enter Symptoms & Confirm Booking
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--text-secondary)' }}>
                👉 Select a doctor from the list to view schedules and book a consultation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MY APPOINTMENTS */}
      {tab === 'my-appts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {appointments.map(appt => (
            <div key={appt.id} className="appt-card glass-panel">
              <div className="appt-header">
                <div className="appt-info-main">
                  <h3>{appt.doctor_name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>🔬 {appt.doctor_specialisation}</p>
                  <div className="appt-time">
                    🗓️ {appt.appointment_date} | 🕒 {appt.appointment_time}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {appt.urgency_level && (
                    <span className={`badge ${getUrgencyClass(appt.urgency_level)}`}>
                      Urgency: {appt.urgency_level}
                    </span>
                  )}
                  <span className={`badge badge-${appt.status}`}>
                    {appt.status}
                  </span>
                </div>
              </div>

              {appt.symptoms && (
                <div className="appt-body">
                  <div className="appt-meta-section">
                    <div className="appt-meta-title">Submitted Symptoms</div>
                    <div className="appt-meta-content">"{appt.symptoms}"</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                {appt.status === 'completed' ? (
                  <button className="btn btn-primary" onClick={() => openSummary(appt)}>
                    📄 View Health Plan & AI Summary
                  </button>
                ) : appt.status === 'booked' ? (
                  <>
                    <button className="btn btn-secondary" disabled>
                      🕒 Confirmed
                    </button>
                    <button className="btn btn-danger" onClick={() => handleCancelAppointment(appt.id)} style={{ padding: '0.5rem 1rem' }}>
                      ❌ Cancel Appointment
                    </button>
                  </>
                ) : (
                  <button className="btn btn-secondary" disabled>
                    ❌ Session Cancelled
                  </button>
                )}
              </div>
            </div>
          ))}
          {appointments.length === 0 && (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No appointments scheduled yet.
            </div>
          )}
        </div>
      )}

      {/* SYMPTOM INPUT MODAL */}
      {showSymptomModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <button className="modal-close" onClick={() => setShowSymptomModal(false)}>×</button>
            <h3 className="modal-title">Describe Symptoms</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Please share your symptoms below. This helps the AI prepare a pre-visit summary for the doctor to review in advance.
            </p>
            <form onSubmit={handleConfirmBooking}>
              <div className="form-group">
                <label className="form-label">Symptom Description</label>
                <textarea
                  className="form-textarea"
                  placeholder="E.g., I have had a dry cough and a mild fever for the past 3 days. Occasionally feeling short of breath..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  required
                ></textarea>
              </div>
              <div style={{ display: 'flex', justifyItems: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSymptomModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Confirm Booking 🚀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST-VISIT HEALTH PLAN MODAL */}
      {showSummaryModal && selectedAppt && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="modal-close" onClick={() => setShowSummaryModal(false)}>×</button>
            <h3 className="modal-title">Health Consultation Summary</h3>
            
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <p><strong>Doctor:</strong> {selectedAppt.doctor_name}</p>
              <p><strong>Date & Time:</strong> {selectedAppt.appointment_date} at {selectedAppt.appointment_time}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <div className="appt-meta-title">Patient-Friendly AI Summary</div>
                <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                  {selectedAppt.post_visit_summary || 'Generating summary...'}
                </div>
              </div>

              {selectedAppt.prescription && (
                <div>
                  <div className="appt-meta-title">Prescription & Advice</div>
                  <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(6, 182, 212, 0.05)', whiteSpace: 'pre-wrap' }}>
                    {selectedAppt.prescription}
                  </div>
                </div>
              )}

              <div>
                <div className="appt-meta-title">Doctor's Clinical Notes</div>
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{selectedAppt.post_visit_notes}"</p>
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setShowSummaryModal(false)}>
                Close Health Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DOCTOR PORTAL
   ========================================================================== */
function DoctorPortal({ user, showToast }) {
  const [appointments, setAppointments] = useState([]);
  
  // Active Consultation Modal
  const [consultAppt, setConsultAppt] = useState(null);
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  
  // Medications list to generate reminders
  const [medications, setMedications] = useState([]);
  const [newMedName, setNewMedName] = useState('');
  const [newMedFreq, setNewMedFreq] = useState('Once daily');

  // Summary View
  const [viewAppt, setViewAppt] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/doctor/appointments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAppointments(data);
    } catch (err) {
      showToast('Failed to load appointments: ' + err.message, 'error');
    }
  };

  const handleCancelAppointment = async (apptId) => {
    if (!confirm('Are you sure you want to cancel this appointment due to urgency? This will notify the patient and clear your schedule.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/doctor/appointments/${apptId}/cancel`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Appointment cancelled successfully.', 'success');
      fetchAppointments();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleStartConsultation = (appt) => {
    setConsultAppt(appt);
    setNotes('');
    setPrescription('');
    setMedications([]);
    setNewMedName('');
    setShowConsultModal(true);
  };

  const handleAddMedication = () => {
    if (!newMedName.trim()) {
      showToast('Enter medication name', 'error');
      return;
    }
    setMedications(prev => [...prev, { name: newMedName.trim(), frequency: newMedFreq }]);
    setNewMedName('');
  };

  const handleRemoveMedication = (index) => {
    setMedications(prev => prev.filter((_, i) => i !== index));
  };

  const handleCompleteConsultation = async (e) => {
    e.preventDefault();
    if (!notes.trim()) {
      showToast('Please type clinical notes to complete the consult.', 'error');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/doctor/appointments/${consultAppt.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          post_visit_notes: notes,
          prescription: prescription || medications.map(m => `${m.name} (${m.frequency})`).join(', '),
          medications: medications
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Consultation completed. AI summary dispatched to patient.', 'success');
      setShowConsultModal(false);
      fetchAppointments();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenSummary = (appt) => {
    setViewAppt(appt);
    setShowSummaryModal(true);
  };

  const getUrgencyClass = (lvl) => {
    if (lvl === 'High') return 'badge-high';
    if (lvl === 'Medium') return 'badge-medium';
    return 'badge-low';
  };

  return (
    <div>
      <div className="dashboard-header">
        <h2 className="dashboard-title">
          Doctor Dashboard
          <span>Manage upcoming patient visits, clinical files, and AI-powered treatment plans.</span>
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {appointments.map(appt => (
          <div key={appt.id} className="appt-card glass-panel">
            <div className="appt-header">
              <div className="appt-info-main">
                <h3>{appt.patient_name}</h3>
                <div className="appt-time">
                  🗓️ {appt.appointment_date} | 🕒 {appt.appointment_time}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {appt.urgency_level && (
                  <span className={`badge ${getUrgencyClass(appt.urgency_level)}`}>
                    Urgency: {appt.urgency_level}
                  </span>
                )}
                <span className={`badge badge-${appt.status}`}>
                  {appt.status}
                </span>
              </div>
            </div>

            {appt.symptoms && (
              <div className="appt-body">
                <div className="grid-2">
                  <div>
                    <div className="appt-meta-title">Patient Symptoms</div>
                    <p style={{ fontSize: '0.95rem' }}>"{appt.symptoms}"</p>
                  </div>
                  {appt.pre_visit_summary && (
                    <div className="glass-panel" style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.03)' }}>
                      <div className="appt-meta-title" style={{ color: 'var(--color-secondary)' }}>AI Chief Complaint</div>
                      <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                        {appt.pre_visit_summary.chief_complaint}
                      </p>
                      {appt.pre_visit_summary.suggested_questions && appt.pre_visit_summary.suggested_questions.length > 0 && (
                        <div>
                          <div className="appt-meta-title" style={{ fontSize: '0.75rem' }}>Suggested Questions:</div>
                          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {appt.pre_visit_summary.suggested_questions.map((q, idx) => (
                              <li key={idx}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              {appt.status === 'booked' ? (
                <>
                  <button className="btn btn-primary" onClick={() => handleStartConsultation(appt)}>
                    🩺 Begin Consultation
                  </button>
                  <button className="btn btn-danger" onClick={() => handleCancelAppointment(appt.id)} style={{ padding: '0.5rem 1rem' }}>
                    ❌ Cancel
                  </button>
                </>
              ) : appt.status === 'completed' ? (
                <button className="btn btn-secondary" onClick={() => handleOpenSummary(appt)}>
                  📄 View Care Plan & AI summary
                </button>
              ) : (
                <button className="btn btn-secondary" disabled>
                  Cancelled
                </button>
              )}
            </div>
          </div>
        ))}
        {appointments.length === 0 && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No appointments booked for you.
          </div>
        )}
      </div>

      {/* START CONSULTATION MODAL */}
      {showConsultModal && consultAppt && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '650px', maxHeight: '95vh', overflowY: 'auto' }}>
            <button className="modal-close" onClick={() => setShowConsultModal(false)}>×</button>
            <h3 className="modal-title">Consultation File</h3>
            <p style={{ marginBottom: '1.25rem' }}>
              <strong>Patient Name:</strong> {consultAppt.patient_name}
            </p>

            <form onSubmit={handleCompleteConsultation}>
              <div className="form-group">
                <label className="form-label">Clinical Visit Notes</label>
                <textarea
                  className="form-textarea"
                  placeholder="Record symptoms observed, diagnosis, and treatment plan detail..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required
                ></textarea>
              </div>

              {/* Medication reminder scheduler */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
                <label className="form-label">Prescribe Medications (Reminder Scheduler)</label>
                
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input 
                    type="text"
                    className="form-input"
                    placeholder="Medication name (e.g. Ibuprofen 400mg)"
                    value={newMedName}
                    onChange={(e) => setNewMedName(e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <select
                    className="form-select"
                    value={newMedFreq}
                    onChange={(e) => setNewMedFreq(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="Once daily">Once daily</option>
                    <option value="Twice daily">Twice daily</option>
                    <option value="Three times daily">Three times daily</option>
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={handleAddMedication}>
                    + Add
                  </button>
                </div>

                {medications.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    {medications.map((med, idx) => (
                      <span key={idx} className="badge badge-booked" style={{ textTransform: 'none', padding: '0.4rem 0.8rem', display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        💊 {med.name} - {med.frequency}
                        <button type="button" onClick={() => handleRemoveMedication(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">General Prescription Text (Optional overrides scheduler above)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="E.g., Ibuprofen 400mg twice daily for 5 days. Drink plenty of water."
                  value={prescription}
                  onChange={(e) => setPrescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConsultModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Complete Consult & Send AI Summary 🚀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW POST-VISIT CARE PLAN MODAL */}
      {showSummaryModal && viewAppt && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="modal-close" onClick={() => setShowSummaryModal(false)}>×</button>
            <h3 className="modal-title">Consultation Summary</h3>
            <p><strong>Patient:</strong> {viewAppt.patient_name}</p>
            <p><strong>Consult Date:</strong> {viewAppt.appointment_date} at {viewAppt.appointment_time}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
              <div>
                <div className="appt-meta-title">Patient-Friendly AI Summary</div>
                <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                  {viewAppt.post_visit_summary || 'No summary available.'}
                </div>
              </div>

              <div>
                <div className="appt-meta-title">Prescription Details</div>
                <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(6, 182, 212, 0.05)', whiteSpace: 'pre-wrap' }}>
                  {viewAppt.prescription || 'No prescription issued.'}
                </div>
              </div>

              <div>
                <div className="appt-meta-title">Original Clinical Notes</div>
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{viewAppt.post_visit_notes}"</p>
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setShowSummaryModal(false)}>
                Close File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   ADMIN PORTAL
   ========================================================================== */
function AdminPortal({ user, showToast, activeTab, setActiveTab }) {
  const [tab, setTab] = useState(activeTab === 'default' ? 'doctors' : activeTab);
  const [doctors, setDoctors] = useState([]);

  // Doctor Form Modal
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPass, setDocPass] = useState('');
  const [docSpec, setDocSpec] = useState('General Medicine');
  const [docSlotDur, setDocSlotDur] = useState(30);
  const [docWorkStart, setDocWorkStart] = useState('09:00');
  const [docWorkEnd, setDocWorkEnd] = useState('17:00');

  // Leave Form
  const [selectedDocId, setSelectedDocId] = useState('');
  const [leaveDate, setLeaveDate] = useState('');
  
  // Conflict warning Modal
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictsData, setConflictsData] = useState(null);

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  const fetchDoctors = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/doctors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDoctors(data);
      if (data.length > 0 && !selectedDocId) {
        setSelectedDocId(data[0].id);
      }
    } catch (err) {
      showToast('Failed to load doctors: ' + err.message, 'error');
    }
  };

  const handleOpenCreateModal = () => {
    setEditDoc(null);
    setDocName('');
    setDocEmail('');
    setDocPass('');
    setDocSpec('General Medicine');
    setDocSlotDur(30);
    setDocWorkStart('09:00');
    setDocWorkEnd('17:00');
    setShowDoctorModal(true);
  };

  const handleOpenEditModal = (doc) => {
    setEditDoc(doc);
    setDocName(doc.name);
    setDocEmail(doc.email);
    setDocPass(''); // Keep password empty unless changing
    setDocSpec(doc.specialisation);
    setDocSlotDur(doc.slot_duration);
    setDocWorkStart(doc.working_start);
    setDocWorkEnd(doc.working_end);
    setShowDoctorModal(true);
  };

  const handleSaveDoctor = async (e) => {
    e.preventDefault();
    if (!docName || !docEmail || (!editDoc && !docPass)) {
      showToast('Please fill all required profile fields.', 'error');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const isEdit = !!editDoc;
      const endpoint = isEdit ? `/admin/doctors/${editDoc.id}` : '/admin/doctors';
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        name: docName,
        email: docEmail,
        specialisation: docSpec,
        slot_duration: parseInt(docSlotDur),
        working_start: docWorkStart,
        working_end: docWorkEnd
      };
      if (!isEdit) body.password = docPass;

      const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(isEdit ? 'Profile updated successfully' : 'Doctor profile registered', 'success');
      setShowDoctorModal(false);
      fetchDoctors();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteDoctor = async (id) => {
    if (!confirm('Are you sure you want to remove this doctor? This will cancel all future appointments and trigger patient notifications.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/doctors/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Doctor deleted and bookings resolved.', 'success');
      fetchDoctors();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRegisterLeave = async (e, resolveConflicts = false) => {
    if (e) e.preventDefault();
    if (!selectedDocId || !leaveDate) {
      showToast('Please select doctor and date.', 'error');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/doctors/${selectedDocId}/leaves`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          leave_date: leaveDate,
          resolveConflicts
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.conflict) {
        // Conflicts exist, display the warnings
        setConflictsData({
          docId: selectedDocId,
          date: leaveDate,
          conflicts: data.conflicts,
          message: data.message
        });
        setShowConflictModal(true);
      } else {
        showToast(data.message, 'success');
        setShowConflictModal(false);
        setLeaveDate('');
        fetchDoctors();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoveLeave = async (docId, dateStr) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/doctors/${docId}/leaves/${dateStr}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Leave day removed.', 'success');
      fetchDoctors();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div>
      <div className="dashboard-header">
        <h2 className="dashboard-title">
          Admin Control Center
          <span>Manage doctor rosters, consult timing configurations, and calendar scheduling leaves.</span>
        </h2>
      </div>

      <div className="tabs-header">
        <button 
          className={`tab-btn ${tab === 'doctors' ? 'active' : ''}`}
          onClick={() => setTab('doctors')}
        >
          🩺 Manage Doctors
        </button>
        <button 
          className={`tab-btn ${tab === 'leaves' ? 'active' : ''}`}
          onClick={() => setTab('leaves')}
        >
          🌴 Leave Schedules
        </button>
      </div>

      {/* TAB 1: MANAGE DOCTORS */}
      {tab === 'doctors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
            <button className="btn btn-primary" onClick={handleOpenCreateModal}>
              ➕ Register Doctor Profile
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {doctors.map(doc => (
              <div key={doc.id} className="appt-card glass-panel">
                <div className="appt-header">
                  <div className="appt-info-main">
                    <h3>{doc.name}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>🔬 Specialisation: {doc.specialisation}</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>📧 Email: {doc.email}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => handleOpenEditModal(doc)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      ✏️ Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDeleteDoctor(doc.id)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      🗑️ Delete
                    </button>
                  </div>
                </div>

                <div className="appt-body" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  <div>
                    <span className="appt-meta-title">Roster Hours</span>
                    <div className="appt-meta-content">{doc.working_start} - {doc.working_end}</div>
                  </div>
                  <div>
                    <span className="appt-meta-title">Slot Duration</span>
                    <div className="appt-meta-content">{doc.slot_duration} minutes</div>
                  </div>
                  <div>
                    <span className="appt-meta-title">Registered Leaves</span>
                    <div className="appt-meta-content" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                      {doc.leaves && doc.leaves.map(l => (
                        <span key={l} className="badge badge-cancelled" style={{ fontSize: '0.7rem' }}>
                          {l}
                        </span>
                      ))}
                      {(!doc.leaves || doc.leaves.length === 0) && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No leaves registered.</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {doctors.length === 0 && (
              <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No doctors registered yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REGISTER LEAVES */}
      {tab === 'leaves' && (
        <div className="grid-2">
          {/* Roster & Add Leave */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Register Leave Day</h3>
            <form onSubmit={(e) => handleRegisterLeave(e, false)}>
              <div className="form-group">
                <label className="form-label">Select Doctor</label>
                <select
                  className="form-select"
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  required
                >
                  <option value="">Select doctor...</option>
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.specialisation})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Leave Date</label>
                <input 
                  type="date"
                  className="form-input"
                  value={leaveDate}
                  min={new Date().toISOString().substring(0, 10)}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                🌴 Submit Leave Day
              </button>
            </form>
          </div>

          {/* List Registered Leaves */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Roster Leave Days</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {doctors.map(doc => (
                <div key={doc.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>{doc.name}</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {doc.leaves && doc.leaves.map(l => (
                      <span key={l} className="badge badge-high" style={{ textTransform: 'none', padding: '0.4rem 0.8rem', display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        🌴 {l}
                        <button onClick={() => handleRemoveLeave(doc.id, l)} style={{ background: 'none', border: 'none', color: '#f43f5e', fontWeight: 'bold', cursor: 'pointer' }}>×</button>
                      </span>
                    ))}
                    {(!doc.leaves || doc.leaves.length === 0) && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No leaves registered.</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CREATE & EDIT DOCTOR DIALOG */}
      {showDoctorModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="modal-close" onClick={() => setShowDoctorModal(false)}>×</button>
            <h3 className="modal-title">{editDoc ? 'Edit Doctor Profile' : 'Register New Doctor'}</h3>

            <form onSubmit={handleSaveDoctor}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Dr. Alice Smith" 
                  value={docName} 
                  onChange={(e) => setDocName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="alice@clinic.com" 
                  value={docEmail} 
                  onChange={(e) => setDocEmail(e.target.value)}
                  required
                />
              </div>

              {!editDoc && (
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="••••••••" 
                    value={docPass} 
                    onChange={(e) => setDocPass(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Specialisation</label>
                <select 
                  className="form-select"
                  value={docSpec}
                  onChange={(e) => setDocSpec(e.target.value)}
                >
                  <option value="General Medicine">General Medicine</option>
                  <option value="Cardiology">Cardiology</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="Dermatology">Dermatology</option>
                </select>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Slot Duration (Mins)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="15" 
                    max="120" 
                    value={docSlotDur} 
                    onChange={(e) => setDocSlotDur(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Working Hours Start</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={docWorkStart} 
                    onChange={(e) => setDocWorkStart(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Working Hours End</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={docWorkEnd} 
                  onChange={(e) => setDocWorkEnd(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDoctorModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFLICT RESOLUTION WARNING DIALOG */}
      {showConflictModal && conflictsData && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ borderColor: 'var(--urgency-high)' }}>
            <h3 className="modal-title" style={{ color: 'var(--urgency-high)' }}>⚠️ Schedule Overlap Detected</h3>
            <p style={{ marginBottom: '1rem' }}>
              You are booking a leave day on <strong>{conflictsData.date}</strong>. {conflictsData.message}
            </p>

            <div className="conflict-list">
              <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.25rem', marginBottom: '0.25rem' }}>
                Conflicting Bookings:
              </div>
              {conflictsData.conflicts.map(c => (
                <div key={c.appointment_id} className="conflict-item">
                  <span>🕒 {c.time}</span>
                  <span>👤 Patient: {c.patient_name}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Proceeding will automatically <strong>cancel</strong> these appointments, remove their Google Calendar entries, and dispatch notification emails to the patients.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowConflictModal(false)}
                style={{ flex: 1 }}
              >
                Go Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => handleRegisterLeave(null, true)}
                style={{ flex: 2, background: 'linear-gradient(135deg, #ef4444, #f43f5e)' }}
              >
                Cancel Bookings & Notify Patients
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

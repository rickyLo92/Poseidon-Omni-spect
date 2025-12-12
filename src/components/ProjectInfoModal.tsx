import { useState, useEffect, useRef } from 'react';

export interface ProjectInfo {
  projectName: string;
  location: string;
  section: string;
  dateOfCapture: string;
}

interface ProjectInfoModalProps {
  isOpen: boolean;
  onSave: (info: ProjectInfo | null) => void;
  initialData?: ProjectInfo | null;
}

export function ProjectInfoModal({ isOpen, onSave, initialData }: ProjectInfoModalProps) {
  const [projectName, setProjectName] = useState('');
  const [location, setLocation] = useState('');
  const [section, setSection] = useState('');
  const [dateOfCapture, setDateOfCapture] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Initialize fields when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setProjectName(initialData.projectName || '');
        setLocation(initialData.location || '');
        setSection(initialData.section || '');
        setDateOfCapture(initialData.dateOfCapture || '');
      } else {
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        setDateOfCapture(today);
      }
      // Show the dialog
      dialogRef.current?.showModal();
    } else {
      // Close the dialog
      dialogRef.current?.close();
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // All fields are optional
    if (projectName.trim() || location.trim() || section.trim() || dateOfCapture.trim()) {
      onSave({
        projectName: projectName.trim(),
        location: location.trim(),
        section: section.trim(),
        dateOfCapture: dateOfCapture.trim() || new Date().toISOString().split('T')[0],
      });
    } else {
      onSave(null);
    }
  };

  const handleSkip = () => {
    onSave(null);
  };

  const handleCancel = () => {
    dialogRef.current?.close();
    onSave(null);
  };

  return (
    <dialog
      ref={dialogRef}
      style={{
        padding: 0,
        border: 'none',
        borderRadius: '12px',
        backgroundColor: '#2a2a2a',
        color: '#ffffff',
        minWidth: '550px',
        maxWidth: '650px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      }}
      onCancel={(e) => {
        e.preventDefault();
        handleCancel();
      }}
    >
      <div style={{ padding: '40px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px', color: '#ffffff', fontSize: '24px', fontWeight: '600' }}>
          Project Information
        </h2>
        <p style={{ marginBottom: '30px', color: '#b0b0b0', fontSize: '14px', lineHeight: '1.5' }}>
          Enter project details for the PDF report (all fields are optional)
        </p>
        
        <form onSubmit={handleSubmit} method="dialog">
          <div style={{ marginBottom: '20px' }}>
            <label 
              htmlFor="projectName"
              style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ffffff', 
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Project Name
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                boxSizing: 'border-box',
                backgroundColor: '#1a1a1a',
                color: '#ffffff',
                border: '2px solid #444',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4CAF50';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#444';
              }}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label 
              htmlFor="location"
              style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ffffff', 
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Location
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                boxSizing: 'border-box',
                backgroundColor: '#1a1a1a',
                color: '#ffffff',
                border: '2px solid #444',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4CAF50';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#444';
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label 
              htmlFor="section"
              style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ffffff', 
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Section
            </label>
            <input
              id="section"
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                boxSizing: 'border-box',
                backgroundColor: '#1a1a1a',
                color: '#ffffff',
                border: '2px solid #444',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4CAF50';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#444';
              }}
            />
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label 
              htmlFor="dateOfCapture"
              style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ffffff', 
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Date of Capture
            </label>
            <input
              id="dateOfCapture"
              type="date"
              value={dateOfCapture}
              onChange={(e) => setDateOfCapture(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                boxSizing: 'border-box',
                backgroundColor: '#1a1a1a',
                color: '#ffffff',
                border: '2px solid #444',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4CAF50';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#444';
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                padding: '12px 24px',
                backgroundColor: '#555',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#666';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#555';
              }}
            >
              Skip
            </button>
            <button
              type="submit"
              style={{
                padding: '12px 24px',
                backgroundColor: '#4CAF50',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#45a049';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#4CAF50';
              }}
            >
              Generate PDF
            </button>
          </div>
        </form>
      </div>
      
      <style>{`
        dialog::backdrop {
          background-color: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(2px);
        }
      `}</style>
    </dialog>
  );
}

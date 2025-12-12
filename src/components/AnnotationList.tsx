import { useMemo, memo } from 'react';
import { Annotation } from '../types';
import { formatTime } from '../utils/storage';

interface AnnotationListProps {
  annotations: Annotation[];
  onAnnotationClick: (annotation: Annotation) => void;
  onAnnotationDelete: (id: string) => void;
}

/**
 * AnnotationList component displays all annotations in a list/table format.
 * 
 * Features:
 * - Shows timestamp in mm:ss format
 * - Shows annotation text
 * - Shows thumbnail from screenshot
 * - Click to seek video to annotation timestamp
 * - Delete annotations
 */
export const AnnotationList = memo(function AnnotationList({
  annotations,
  onAnnotationClick,
  onAnnotationDelete,
}: AnnotationListProps) {
  // Memoize sorted annotations to avoid re-sorting on every render
  const sortedAnnotations = useMemo(
    () => [...annotations].sort((a, b) => a.videoTime - b.videoTime),
    [annotations]
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '10px',
        backgroundColor: '#f5f5f5',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Annotations ({annotations.length})</h3>
      {annotations.length === 0 ? (
        <p style={{ color: '#666' }}>No annotations yet. Enable annotation mode to create one.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sortedAnnotations.map((annotation) => (
              <div
                key={annotation.id}
                onClick={() => onAnnotationClick(annotation)}
                onDoubleClick={() => onAnnotationClick(annotation)}
                style={{
                  padding: '10px',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  border: `2px solid ${annotation.colour}`,
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  {annotation.screenshotDataUrl && (
                    <img
                      src={annotation.screenshotDataUrl}
                      alt="Annotation thumbnail"
                      style={{
                        width: '80px',
                        height: '60px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '5px',
                      }}
                    >
                      <strong style={{ color: annotation.colour }}>
                        {formatTime(annotation.videoTime)}
                      </strong>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnnotationDelete(annotation.id);
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#ff4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    <div style={{ color: '#333', wordBreak: 'break-word' }}>
                      {annotation.notes || annotation.label || '(No notes)'}
                    </div>
                    {(annotation.grade !== undefined || annotation.drops !== undefined || annotation.riskIndex !== undefined || annotation.primaryDescription || annotation.secondaryDescription || annotation.description) && (
                      <div style={{ marginTop: '5px', fontSize: '12px', color: '#555' }}>
                        {(annotation.primaryDescription || annotation.secondaryDescription) && (
                          <div style={{ marginTop: '3px' }}>
                            <strong>Description:</strong> {annotation.primaryDescription || ''}
                            {annotation.primaryDescription && annotation.secondaryDescription && ' - '}
                            {annotation.secondaryDescription || ''}
                          </div>
                        )}
                        {!annotation.primaryDescription && annotation.description && (
                          <div style={{ marginTop: '3px' }}>
                            <strong>Description:</strong> {annotation.description}
                          </div>
                        )}
                        {annotation.grade !== undefined && (
                          <span style={{ marginRight: '10px' }}>
                            <strong>Grade:</strong> {annotation.grade === 'N/A' ? 'N/A' : annotation.grade}
                          </span>
                        )}
                        {annotation.drops !== undefined && (
                          <span style={{ marginRight: '10px' }}>
                            <strong>DROPS:</strong> {annotation.drops === 'N/A' ? 'N/A' : annotation.drops}
                          </span>
                        )}
                        {annotation.riskIndex !== undefined && (
                          <span style={{ marginRight: '10px' }}>
                            <strong>Risk Index:</strong> {annotation.riskIndex} {annotation.riskLevel && `(${annotation.riskLevel})`}
                          </span>
                        )}
                        {/* Legacy fields for backward compatibility */}
                        {!annotation.grade && annotation.severity && (
                          <span style={{ marginRight: '10px' }}>
                            <strong>Severity:</strong> {annotation.severity}/5
                          </span>
                        )}
                        {!annotation.drops && annotation.criticality && (
                          <span style={{ marginRight: '10px' }}>
                            <strong>Criticality:</strong> {annotation.criticality}/5
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#666',
                        marginTop: '5px',
                      }}
                    >
                      Created: {new Date(annotation.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
});


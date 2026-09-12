export default function Modal({ title, wide, onClose, children, footer }) {
  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`}>
        <header>{title}</header>
        <div className="body">{children}</div>
        {footer && <div className="footer">{footer}</div>}
      </div>
    </div>
  );
}

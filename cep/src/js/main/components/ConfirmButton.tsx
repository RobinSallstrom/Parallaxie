import { useEffect, useRef, useState } from "react";

/**
 * Inline confirm pattern (PANEL_SPEC.md 9.4) -- the panel's only
 * confirmation mechanism. No confirm(), no modal, ever. First click turns
 * the button into "<message> [Confirm] [Cancel]"; auto-cancels after 6 s.
 */
export const ConfirmButton = (props: {
  label: string;
  message: string;
  onConfirm: () => void;
  disabled?: boolean;
}) => {
  const [arming, setArming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArming(false);
  };

  if (!arming) {
    return (
      <button
        disabled={props.disabled}
        onClick={() => {
          setArming(true);
          timer.current = setTimeout(disarm, 6000);
        }}
      >
        {props.label}
      </button>
    );
  }
  return (
    <span className="confirm-strip">
      <span className="confirm-msg">{props.message}</span>
      <button
        className="danger"
        onClick={() => {
          disarm();
          props.onConfirm();
        }}
      >
        Confirm
      </button>
      <button onClick={disarm}>Cancel</button>
    </span>
  );
};

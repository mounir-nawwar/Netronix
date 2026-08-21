import { useContext } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { motion } from 'framer-motion';

import { ShopContext } from '../context/shopContext';
import PropTypes from 'prop-types';

// FE-005 — this bypassed the router entirely.
//
// `window.history.back()` steps the browser's history without telling React
// Router, so any state the router holds for the previous entry is not restored:
// the search overlay stays as it was, the scroll restoration does not run, and
// in a `MemoryRouter` — which is what the tests use — nothing happens at all.
// The component also imported `useNavigate` and never called it.
//
// `goBack()` is `navigate(-1)`, which is the same step through the same history
// with the router in the loop.

const BackButton = ({ className = '', showLabel = true }) => {
  const { goBack } = useContext(ShopContext);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-center gap-2 text-gray-600 hover:text-[#6a5acd] transition-colors ${className}`}
      onClick={goBack}
      aria-label="Go back"
    >
      <FiArrowLeft className="w-4 h-4" />
      {showLabel && <span className="text-sm">Back</span>}
    </motion.button>
  );
};

BackButton.propTypes = {
    className: PropTypes.string,
    showLabel: PropTypes.bool,
};

export default BackButton;

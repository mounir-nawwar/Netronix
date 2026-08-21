// The real `react-toastify` container, and the only module that imports the
// library or its stylesheet statically (PERF-003).
//
// It is reached exclusively through `ToastHost`'s dynamic import, which is what
// keeps both off the critical path of the first paint. The props are the ones
// `App.jsx` used to pass, unchanged — the notifications look and behave exactly
// as they did.
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

const ToastSurface = () => (
    <ToastContainer
        position="bottom-right"
        autoClose={3000}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        closeButton={false}
    />
)

export default ToastSurface

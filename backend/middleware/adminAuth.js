import jwt from 'jsonwebtoken'

const adminAuth = async (req, res, next) => {
    try {
        const { token } = req.headers;
        
        if (!token) {
            return res.json({ success: false, message: "Authorization failed: No token provided" });
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            if (decoded !== process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD) {
                return res.json({ success: false, message: "Authorization failed: Invalid credentials" });
            }
            
            // Authentication successful, proceed to the controller
            next();
        } catch (tokenError) {
            return res.json({ success: false, message: `Invalid token: ${tokenError.message}` });
        }
    } catch (error) {
        res.json({ success: false, message: `Authentication error: ${error.message}` });
    }
}

export default adminAuth
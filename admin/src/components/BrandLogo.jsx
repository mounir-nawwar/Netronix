import PropTypes from 'prop-types';

const BrandLogo = ({ className = '', title = 'Netronix' }) => (
    <img 
        src="https://cdn.prod.website-files.com/67ccd759c5839fca18ed2c8f/67ccde31189939f4c5cd0722_Netronix%20Logo%20black.png" 
        alt={title} 
        className={className}
        style={{ display: 'block' }}
    />
);

BrandLogo.propTypes = {
    className: PropTypes.string,
    title: PropTypes.string,
};

export default BrandLogo;

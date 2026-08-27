import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

// The interstitial that breaks the grid's rhythm.
//
// The research is unambiguous that a *bento* product grid is a mistake: shoppers
// compare products on shared dimensions — image, name, price — and variable card
// sizes actively impair that, which is why the retailers who tried it reverted.
// So the cards stay uniform and the editorial weight goes between the rows
// instead, where it costs nothing to compare and buys back the sense that a
// person laid the page out.
//
// The imagery is the WebP set `scripts/optimise-media.sh` already produced for
// the homepage — two widths each, `srcset` and `sizes` written out, explicit
// `width`/`height` so the tile reserves its own space. Nothing new is fetched.
//
// The CTA is the only labelled link inside the tile and it is deliberately a
// plain `<a>` **outside** any `.product-card`: `collections.test.jsx` reads the
// grid's product names by mapping every link's `aria-label` in order, so a tile
// that carried one would insert itself into that list.

const EditorialTile = ({ eyebrow, title, copy, to, cta, image, imageSmall, width, height }) => (
    <article className="group relative col-span-2 overflow-hidden bg-ink md:col-span-3 xl:col-span-4">
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/8]">
            <img
                src={image}
                srcSet={imageSmall ? `${imageSmall} 800w, ${image} 1600w` : undefined}
                sizes="(max-width: 767px) 100vw, 92vw"
                alt=""
                width={width}
                height={height}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover opacity-55 transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
            />

            <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10 lg:p-14">
                {eyebrow && (
                    <p className="font-michroma text-[9px] uppercase tracking-[0.22em] text-paper/60 md:text-[10px]">
                        {eyebrow}
                    </p>
                )}
                <h3 className="mt-3 max-w-[16ch] font-michroma text-xl uppercase leading-tight tracking-wide text-paper md:text-3xl lg:text-4xl">
                    {title}
                </h3>
                {copy && (
                    <p className="mt-3 max-w-[46ch] text-xs leading-relaxed text-paper/70 md:text-sm">
                        {copy}
                    </p>
                )}
                <Link
                    to={to}
                    className="mt-6 inline-flex w-fit items-center gap-2 border border-paper/40 px-5 py-2.5 font-michroma text-[9px] uppercase tracking-[0.18em] text-paper transition-colors duration-300 hover:border-paper hover:bg-paper hover:text-ink md:text-[10px]"
                >
                    <span>{cta}</span>
                    <span aria-hidden="true">&#8599;</span>
                </Link>
            </div>
        </div>
    </article>
)

EditorialTile.propTypes = {
    eyebrow: PropTypes.string,
    title: PropTypes.string.isRequired,
    copy: PropTypes.string,
    to: PropTypes.string.isRequired,
    cta: PropTypes.string.isRequired,
    image: PropTypes.string.isRequired,
    imageSmall: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number,
}

export default EditorialTile

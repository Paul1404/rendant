const OUTER_ROSETTE_ANGLES = Array.from(
	{ length: 12 },
	(_, index) => index * 15,
);
const MIDDLE_ROSETTE_ANGLES = Array.from(
	{ length: 8 },
	(_, index) => index * 22.5,
);
const INNER_ROSETTE_ANGLES = Array.from(
	{ length: 6 },
	(_, index) => index * 30,
);
const RIBBON_OFFSETS = [-16, -10, -5, 0, 5, 10, 16];

const RIBBON_PATH =
	"M0 48Q15 20 30 48Q45 20 60 48Q75 20 90 48Q105 20 120 48Q135 20 150 48Q165 20 180 48Q195 20 210 48Q225 20 240 48Q255 20 270 48Q285 20 300 48Q315 20 330 48Q345 20 360 48Q375 20 390 48Q405 20 420 48Q435 20 450 48Q465 20 480 48";

export function MainWatermark() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden min-[900px]:block"
		>
			<svg
				viewBox="0 0 1200 900"
				fill="none"
				focusable="false"
				className="fixed top-16 h-[56rem] w-[75rem] max-w-none overflow-visible"
				style={{
					// Keep the large rosette in the unused right gutter. On ultra-wide
					// screens the cap lets it fade beyond the viewport instead of exposing
					// an empty strip at the edge.
					left: "calc(100vw - min(16rem, max(0px, calc(25vw - 18rem))) - 65rem)",
				}}
			>
				<title>Guilloché-Muster</title>
				<defs>
					<linearGradient
						id="main-watermark-ribbon-fade"
						gradientUnits="userSpaceOnUse"
						x1="0"
						y1="0"
						x2="1200"
						y2="0"
					>
						<stop offset="0" stopColor="white" stopOpacity="0" />
						<stop offset="0.42" stopColor="white" stopOpacity="0.18" />
						<stop offset="0.72" stopColor="white" stopOpacity="0.82" />
						<stop offset="1" stopColor="white" />
					</linearGradient>
					<radialGradient id="main-watermark-rosette-fade">
						<stop offset="0" stopColor="white" />
						<stop offset="0.7" stopColor="white" stopOpacity="0.9" />
						<stop offset="1" stopColor="white" stopOpacity="0" />
					</radialGradient>
					<mask
						id="main-watermark-ribbon-mask"
						maskUnits="userSpaceOnUse"
						x="-120"
						y="-120"
						width="1640"
						height="1140"
					>
						<rect
							x="0"
							y="0"
							width="1500"
							height="900"
							fill="url(#main-watermark-ribbon-fade)"
						/>
					</mask>
					<mask id="main-watermark-rosette-mask">
						<circle
							cx="1040"
							cy="650"
							r="330"
							fill="url(#main-watermark-rosette-fade)"
						/>
					</mask>
				</defs>

				<g
					mask="url(#main-watermark-ribbon-mask)"
					className="stroke-brand/[0.1] dark:stroke-brand/[0.14]"
					strokeWidth="0.8"
				>
					{RIBBON_OFFSETS.map((offset) => (
						<path
							key={`top-${offset}`}
							d={RIBBON_PATH}
							transform={`translate(0 ${180 + offset}) scale(3 1)`}
						/>
					))}
					{[-8, 0, 8].map((offset) => (
						<path
							key={`bottom-${offset}`}
							d={RIBBON_PATH}
							transform={`translate(45 ${180 + offset}) scale(3 -1) translate(0 -96)`}
						/>
					))}
				</g>

				<g
					mask="url(#main-watermark-rosette-mask)"
					className="stroke-brand/[0.13] dark:stroke-brand/[0.17]"
					strokeWidth="0.8"
				>
					{OUTER_ROSETTE_ANGLES.map((angle) => (
						<ellipse
							key={`outer-${angle}`}
							cx="1040"
							cy="650"
							rx="266"
							ry="102"
							transform={`rotate(${angle} 1040 650)`}
						/>
					))}
					{MIDDLE_ROSETTE_ANGLES.map((angle) => (
						<ellipse
							key={`middle-${angle}`}
							cx="1040"
							cy="650"
							rx="182"
							ry="60"
							transform={`rotate(${angle} 1040 650)`}
						/>
					))}
					{INNER_ROSETTE_ANGLES.map((angle) => (
						<ellipse
							key={`inner-${angle}`}
							cx="1040"
							cy="650"
							rx="109"
							ry="35"
							transform={`rotate(${angle} 1040 650)`}
						/>
					))}
				</g>
				<g
					mask="url(#main-watermark-rosette-mask)"
					className="stroke-brass/[0.16] dark:stroke-brass/[0.21]"
					strokeWidth="0.9"
				>
					{[308, 294, 214, 203, 123].map((radius) => (
						<circle key={radius} cx="1040" cy="650" r={radius} />
					))}
				</g>
			</svg>
		</div>
	);
}

const ROSETTE_ANGLES = Array.from({ length: 36 }, (_, index) => index * 5);
const INNER_ROSETTE_ANGLES = Array.from(
	{ length: 24 },
	(_, index) => index * 7.5,
);
const RIBBON_OFFSETS = [-18, -13, -8, -3, 3, 8, 13, 18];

export function MainWatermark() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
		>
			<svg
				viewBox="0 0 1200 900"
				fill="none"
				focusable="false"
				className="fixed top-16 h-[56rem] w-[75rem] max-w-none overflow-visible"
				style={{
					// The rosette is at x=1040 in the 1200px artwork. Once the
					// viewport exceeds the 72rem content width, its centre follows
					// the middle of the otherwise unused right-hand gutter.
					left: "calc(100vw - max(0px, calc(25vw - 18rem)) - 65rem)",
				}}
			>
				<title>Guilloché-Muster</title>
				<defs>
					<linearGradient
						id="main-watermark-ribbon-fade"
						x1="0"
						y1="0"
						x2="1"
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
					<mask id="main-watermark-ribbon-mask">
						<rect
							x="0"
							y="0"
							width="1200"
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

				<g mask="url(#main-watermark-ribbon-mask)">
					<g
						className="stroke-primary/[0.055] dark:stroke-primary/[0.09]"
						strokeWidth="1.15"
					>
						{RIBBON_OFFSETS.map((offset) => (
							<path
								key={offset}
								d="M-100 236 C105 72 286 390 492 218 S875 64 1090 226 S1310 338 1380 174"
								transform={`translate(0 ${offset})`}
							/>
						))}
					</g>
					<g
						className="stroke-brass/[0.07] dark:stroke-brass/[0.11]"
						strokeWidth="0.9"
					>
						<path d="M-100 236 C105 72 286 390 492 218 S875 64 1090 226 S1310 338 1380 174" />
						<path
							d="M-100 236 C105 72 286 390 492 218 S875 64 1090 226 S1310 338 1380 174"
							transform="translate(0 11)"
						/>
					</g>
				</g>

				<g mask="url(#main-watermark-rosette-mask)">
					<g
						className="stroke-primary/[0.06] dark:stroke-primary/[0.095]"
						strokeWidth="0.9"
					>
						{ROSETTE_ANGLES.map((angle) => (
							<ellipse
								key={angle}
								cx="1040"
								cy="650"
								rx="292"
								ry="94"
								transform={`rotate(${angle} 1040 650)`}
							/>
						))}
					</g>
					<g
						className="stroke-primary/[0.045] dark:stroke-primary/[0.075]"
						strokeWidth="0.75"
					>
						{INNER_ROSETTE_ANGLES.map((angle) => (
							<ellipse
								key={angle}
								cx="1040"
								cy="650"
								rx="226"
								ry="68"
								transform={`rotate(${angle + 2.5} 1040 650)`}
							/>
						))}
					</g>
					<g
						className="stroke-brass/[0.085] dark:stroke-brass/[0.12]"
						strokeWidth="0.85"
					>
						{[0, 30, 60, 90, 120, 150].map((angle) => (
							<ellipse
								key={angle}
								cx="1040"
								cy="650"
								rx="260"
								ry="82"
								transform={`rotate(${angle} 1040 650)`}
							/>
						))}
					</g>
					<circle
						cx="1040"
						cy="650"
						r="305"
						className="stroke-primary/[0.055] dark:stroke-primary/[0.09]"
						strokeWidth="1.2"
					/>
					<circle
						cx="1040"
						cy="650"
						r="314"
						className="stroke-brass/[0.065] dark:stroke-brass/[0.1]"
						strokeWidth="0.8"
					/>
				</g>
			</svg>
		</div>
	);
}

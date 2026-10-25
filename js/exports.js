import { state } from "./state.js";

// jsPDF is loaded on demand, the first time labels are generated
const jsPDFModule = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";

const labelField = (value) => String(value ?? "");

const downloadBlob = (blob, filename) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const generateLabels = async () => {
	if (state.labels.length === 0) {
		return;
	}
	const {jsPDF} = await import(jsPDFModule);
	// 3 x 10 labels per letter page, same layout as the old FPDF version
	const pdf = new jsPDF({orientation: "portrait", unit: "in", format: "letter"});
	const cellMargin = 0.0394; // FPDF default cell margin (1mm)
	const lineHeight = 0.15;
	const width = 2.4;
	const baselineOffset = lineHeight / 2 + 0.3 * (8 / 72);
	let row = 0;
	let y = 0;
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(8);

	state.labels.forEach((addr, i) => {
		if (i % 30 === 0) {
			if (i > 0) {
				pdf.addPage();
			}
			row = 0;
		}
		const col = i % 3;
		const x = 0.3 + (col * 2.6) + (col * 0.15);
		if (col === 0) {
			y = 0.6 + row + 0.001;
			row++;
		}
		const lines = ["pin", "owner", "addr1", "addr2", "addr3"]
			.flatMap(k => pdf.splitTextToSize(labelField(addr[k]), width - 2 * cellMargin));
		lines.forEach((line, n) => pdf.text(line, x + cellMargin, y + n * lineHeight + baselineOffset));
	});

	const pin = labelField(state.labels[0].pin || "labels").replace(/[^A-Za-z0-9_-]/g, "");
	pdf.save(`mail_list_${pin}.pdf`);
};

export const exportCsv = () => {
	if (state.labels.length === 0) {
		return;
	}
	const quote = (value) => `"${labelField(value).replace(/"/g, '""')}"`;
	const rows = state.labels.map(({owner, addr1, addr2, addr3}) => [owner, addr1, addr2, addr3].map(quote).join(","));
	const csv = ["Owner,Address1,Address2,Address3", ...rows].join("\n") + "\n";
	downloadBlob(new Blob([csv], {type: "text/csv;charset=utf-8"}), "mailing_list_table.csv");
};

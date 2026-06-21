-- Seed the singleton settings row with the club's master data. Only fills the
-- newly added fields while they are still empty; never overwrites a value an
-- admin has set, and never touches the existing vereinsname.
UPDATE "app_settings" SET
	"verein_strasse" = 'Triebweg 9',
	"verein_plz" = '97508',
	"verein_ort" = 'Untereuerheim',
	"verein_vorstand" = 'Alexander Eckert (Vorstandsvorsitzender), Lorin Hümpfer (stv. Vorstandsvorsitzender)',
	"verein_registergericht" = 'Amtsgericht Schweinfurt',
	"verein_registernummer" = 'VR 31'
WHERE "id" = 1
	AND "verein_strasse" = ''
	AND "verein_plz" = ''
	AND "verein_ort" = ''
	AND "verein_vorstand" = ''
	AND "verein_registergericht" = ''
	AND "verein_registernummer" = '';

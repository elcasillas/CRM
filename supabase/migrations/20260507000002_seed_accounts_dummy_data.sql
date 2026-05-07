-- Seed 52 dummy accounts across five industry types:
-- Teleco (12), Cableco (10), Hoster (10), ISP (10), MSP (10)
--
-- Adds 'ISP' to the industry check constraint since Internet Service Providers
-- are a distinct category from general Telecoms in this segment.
--
-- account_owner_id is assigned to the first admin profile, falling back to
-- any existing profile. Run after at least one user exists in auth.users.

-- Extend industry constraint to include ISP
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_industry_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_industry_check
    CHECK (industry IN ('Teleco', 'Cableco', 'Hoster', 'MSP', 'Marketplace', 'Virtual Office', 'ISP'));

DO $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT id INTO v_owner
    FROM public.profiles
    WHERE role = 'admin'
    ORDER BY created_at
    LIMIT 1;

  IF v_owner IS NULL THEN
    SELECT id INTO v_owner
      FROM public.profiles
      ORDER BY created_at
      LIMIT 1;
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'No profiles found — seed at least one user before running this migration.';
  END IF;

  INSERT INTO public.accounts
    (account_name, account_website, address_line1, city, region, postal, country, status, industry, description, account_owner_id)
  VALUES

  -- ── Telecommunications Companies (Teleco) ──────────────────────────────────
  ('Bell Canada Enterprise',
   'https://www.bell.ca',
   '1 Carrefour Alexander-Graham-Bell', 'Verdun', 'QC', 'H3E 3B3', 'CA',
   'active', 'Teleco',
   'Canada''s largest telecommunications company offering wireless, internet, TV, and business solutions.',
   v_owner),

  ('Rogers Communications',
   'https://www.rogers.com',
   '333 Bloor Street East', 'Toronto', 'ON', 'M4W 1G9', 'CA',
   'active', 'Teleco',
   'Leading Canadian communications and media company providing wireless, cable, and media services.',
   v_owner),

  ('TELUS Business Solutions',
   'https://www.telus.com',
   '510 W Georgia Street', 'Vancouver', 'BC', 'V6B 0M3', 'CA',
   'active', 'Teleco',
   'National telecommunications company delivering wireless, internet, TV, and security services.',
   v_owner),

  ('Videotron Business',
   'https://www.videotron.com',
   '612 Rue Saint-Jacques', 'Montreal', 'QC', 'H3C 4M8', 'CA',
   'active', 'Teleco',
   'Quebec-based telecommunications and cable company, part of the Quebecor group.',
   v_owner),

  ('SaskTel Solutions',
   'https://www.sasktel.com',
   '2121 Saskatchewan Drive', 'Regina', 'SK', 'S4P 3Y2', 'CA',
   'active', 'Teleco',
   'Crown corporation providing voice, data, Internet, and entertainment services in Saskatchewan.',
   v_owner),

  ('Eastlink Business',
   'https://www.eastlink.ca',
   '6080 Young Street', 'Halifax', 'NS', 'B3K 5L2', 'CA',
   'active', 'Teleco',
   'Atlantic Canadian telecom and cable company offering internet, TV, and wireless services.',
   v_owner),

  ('Cogeco Communications',
   'https://www.cogeco.ca',
   '5 Place Ville Marie', 'Montreal', 'QC', 'H3B 2G2', 'CA',
   'active', 'Teleco',
   'Canadian telecommunications company serving Ontario, Quebec, and several US markets.',
   v_owner),

  ('MTS Business Solutions',
   'https://www.bell.ca/bell-mts',
   '333 Main Street', 'Winnipeg', 'MB', 'R3C 3V6', 'CA',
   'inactive', 'Teleco',
   'Manitoba Telecom Services — now part of Bell, serves business customers in Manitoba.',
   v_owner),

  ('Globalive Communications',
   'https://www.globalive.com',
   '207 Queens Quay West', 'Toronto', 'ON', 'M5J 1A7', 'CA',
   'active', 'Teleco',
   'Investment and operating company focused on telecommunications and technology ventures in Canada.',
   v_owner),

  ('Freedom Mobile Business',
   'https://www.freedommobile.ca',
   '5915 Airport Road', 'Mississauga', 'ON', 'L4V 1T1', 'CA',
   'active', 'Teleco',
   'Canada''s fourth-largest wireless carrier offering affordable national plans and business services.',
   v_owner),

  ('Ice Wireless Inc',
   'https://www.icewireless.com',
   '4920 52nd Street', 'Yellowknife', 'NT', 'X1A 3T1', 'CA',
   'inactive', 'Teleco',
   'Wireless carrier providing LTE services to Northern Canada and remote communities.',
   v_owner),

  ('Tbaytel Business Solutions',
   'https://www.tbaytel.com',
   '1046 Memorial Avenue', 'Thunder Bay', 'ON', 'P7B 4A3', 'CA',
   'active', 'Teleco',
   'Regional telecommunications company providing wireless, internet, and TV services in Northwestern Ontario.',
   v_owner),

  -- ── Cable Companies (Cableco) ──────────────────────────────────────────────
  ('Access Communications',
   'https://www.myaccess.ca',
   '2250 Park Street', 'Regina', 'SK', 'S4N 7K7', 'CA',
   'active', 'Cableco',
   'Saskatchewan-based cable and internet cooperative serving rural and urban communities.',
   v_owner),

  ('WTC Communications',
   'https://www.wtc.net',
   '5030 50th Street', 'Westlock', 'AB', 'T7P 1H7', 'CA',
   'active', 'Cableco',
   'Westlock and area cable TV, internet, and phone service provider.',
   v_owner),

  ('Look Communications',
   'https://www.lookcomm.ca',
   '135 Ferris Lane', 'Barrie', 'ON', 'L4M 6C3', 'CA',
   'active', 'Cableco',
   'Ontario cable and internet service provider serving residential and business customers.',
   v_owner),

  ('Barrett Xplore Inc',
   'https://www.xplornet.com',
   '3210 Woodstock Road', 'Woodstock', 'ON', 'N4S 7X4', 'CA',
   'active', 'Cableco',
   'Rural cable and fixed-wireless broadband provider operating across Canada.',
   v_owner),

  ('Persona Communications',
   'https://www.personatv.ca',
   '28 Cromer Avenue', 'Corner Brook', 'NL', 'A2H 3G2', 'CA',
   'inactive', 'Cableco',
   'Newfoundland-based cable television and internet service provider.',
   v_owner),

  ('CityWest Cable',
   'https://www.citywest.ca',
   '1101 3rd Avenue West', 'Prince Rupert', 'BC', 'V8J 1M4', 'CA',
   'active', 'Cableco',
   'Locally owned cable, internet, and phone provider serving Northern BC communities.',
   v_owner),

  ('NorthernTel',
   'https://www.northerntel.ca',
   '200 First Avenue West', 'North Bay', 'ON', 'P1B 3B8', 'CA',
   'active', 'Cableco',
   'Telephone and cable services provider for Northern and Eastern Ontario.',
   v_owner),

  ('Hay Communications',
   'https://www.hay.net',
   '75 Kirkwood Drive', 'Zurich', 'ON', 'N0M 2T0', 'CA',
   'active', 'Cableco',
   'Southwestern Ontario cooperative delivering cable, internet, and phone services.',
   v_owner),

  ('Wightman Telecom',
   'https://www.wightman.ca',
   '195 Main Street West', 'Listowel', 'ON', 'N4W 1A4', 'CA',
   'active', 'Cableco',
   'Independent cable and internet provider serving rural communities in Southwestern Ontario.',
   v_owner),

  ('Tucows Inc',
   'https://www.tucows.com',
   '96 Mowat Avenue', 'Toronto', 'ON', 'M6K 3M1', 'CA',
   'active', 'Cableco',
   'Global provider of cable broadband, domain services, and mobile services through Ting and Hover brands.',
   v_owner),

  -- ── Web Hosting Companies (Hoster) ────────────────────────────────────────
  ('GoDaddy Canada',
   'https://www.godaddy.com',
   '6 Antares Drive', 'Ottawa', 'ON', 'K2E 8A9', 'CA',
   'active', 'Hoster',
   'World''s largest domain registrar and web hosting provider serving millions of Canadian businesses.',
   v_owner),

  ('Bluehost Canada',
   'https://www.bluehost.com',
   '10 King Street East', 'Toronto', 'ON', 'M5C 1C3', 'CA',
   'active', 'Hoster',
   'Popular web hosting provider offering shared, VPS, and WordPress hosting solutions.',
   v_owner),

  ('SiteGround Canada',
   'https://www.siteground.com',
   '700 West Georgia Street', 'Vancouver', 'BC', 'V7Y 1B8', 'CA',
   'active', 'Hoster',
   'Premium web hosting company known for WordPress and WooCommerce optimized hosting plans.',
   v_owner),

  ('WP Engine',
   'https://www.wpengine.com',
   '1 Yonge Street', 'Toronto', 'ON', 'M5E 1E5', 'CA',
   'active', 'Hoster',
   'Managed WordPress hosting platform powering millions of sites worldwide with enterprise-grade infrastructure.',
   v_owner),

  ('Kinsta Canada',
   'https://www.kinsta.com',
   '130 Adelaide Street West', 'Toronto', 'ON', 'M5H 3P5', 'CA',
   'active', 'Hoster',
   'Premium managed WordPress and application hosting built on Google Cloud Platform.',
   v_owner),

  ('DreamHost Canada',
   'https://www.dreamhost.com',
   '400 Burrard Street', 'Vancouver', 'BC', 'V6C 3A6', 'CA',
   'active', 'Hoster',
   'Employee-owned web hosting company offering domains, shared, VPS, and cloud hosting.',
   v_owner),

  ('Namecheap Canada',
   'https://www.namecheap.com',
   '365 Bay Street', 'Toronto', 'ON', 'M5H 2V2', 'CA',
   'active', 'Hoster',
   'Accredited domain registrar and web hosting provider offering affordable plans for businesses.',
   v_owner),

  ('A2 Hosting Canada',
   'https://www.a2hosting.com',
   '2000 Argentia Road', 'Mississauga', 'ON', 'L5N 1W1', 'CA',
   'active', 'Hoster',
   'Speed-focused web hosting provider offering shared, reseller, VPS, and dedicated server plans.',
   v_owner),

  ('Liquid Web Canada',
   'https://www.liquidweb.com',
   '438 University Avenue', 'Toronto', 'ON', 'M5G 2K8', 'CA',
   'active', 'Hoster',
   'Managed hosting provider specializing in VPS, dedicated servers, and cloud solutions for agencies.',
   v_owner),

  ('Cloudflare Canada',
   'https://www.cloudflare.com',
   '150 King Street West', 'Toronto', 'ON', 'M5H 1J9', 'CA',
   'active', 'Hoster',
   'Global cloud platform providing CDN, DDoS protection, and performance services to web hosting customers.',
   v_owner),

  -- ── Internet Service Providers (ISP) ──────────────────────────────────────
  ('TekSavvy Solutions',
   'https://www.teksavvy.com',
   '419 King Street West', 'Chatham', 'ON', 'N7M 1E5', 'CA',
   'active', 'ISP',
   'Independent Canadian ISP offering residential and business internet over cable and DSL infrastructure.',
   v_owner),

  ('Distributel Communications',
   'https://www.distributel.ca',
   '116 Albert Street', 'Ottawa', 'ON', 'K1P 5G3', 'CA',
   'active', 'ISP',
   'Canadian ISP providing home phone, internet, and wireless reseller services nationwide.',
   v_owner),

  ('Beanfield Technologies',
   'https://www.beanfield.com',
   '200 Adelaide Street West', 'Toronto', 'ON', 'M5H 1W7', 'CA',
   'active', 'ISP',
   'Toronto-based fibre internet provider delivering gigabit connectivity to residential and business customers.',
   v_owner),

  ('VMedia Inc',
   'https://www.vmedia.ca',
   '167 Sheppard Avenue East', 'Toronto', 'ON', 'M2N 3A6', 'CA',
   'active', 'ISP',
   'Canadian discount internet and TV reseller offering competitive broadband and streaming packages.',
   v_owner),

  ('Ebox Internet',
   'https://www.ebox.ca',
   '3100 boul. Le Carrefour', 'Terrebonne', 'QC', 'J6X 5B1', 'CA',
   'active', 'ISP',
   'Quebec-based internet service provider offering residential and small business broadband packages.',
   v_owner),

  ('Start Communications',
   'https://www.startcommunications.ca',
   '3660 Midland Avenue', 'Scarborough', 'ON', 'M1V 4V3', 'CA',
   'active', 'ISP',
   'Independent Ontario ISP providing residential and business internet, phone, and TV services.',
   v_owner),

  ('Acanac Inc',
   'https://www.acanac.net',
   '2525 Cavendish Blvd', 'Montreal', 'QC', 'H4B 2Y4', 'CA',
   'inactive', 'ISP',
   'Value-focused Canadian internet provider offering broadband reseller services in Ontario and Quebec.',
   v_owner),

  ('Execulink Telecom',
   'https://www.execulink.com',
   '499 Dundas Street', 'Woodstock', 'ON', 'N4S 1C2', 'CA',
   'active', 'ISP',
   'Southwestern Ontario ISP offering fibre, cable, and fixed-wireless internet to homes and businesses.',
   v_owner),

  ('Primus Canada',
   'https://www.primuscanada.ca',
   '5343 Dundas Street West', 'Toronto', 'ON', 'M9B 6K5', 'CA',
   'active', 'ISP',
   'Canadian internet and phone service provider serving residential and business customers.',
   v_owner),

  ('Cybersurf Corp',
   'https://www.cybersurf.net',
   '555 11th Avenue SW', 'Calgary', 'AB', 'T2R 1P5', 'CA',
   'active', 'ISP',
   'Alberta-based internet service provider delivering broadband solutions to residential and SMB clients.',
   v_owner),

  -- ── Managed Service Providers (MSP) ───────────────────────────────────────
  ('Compugen Systems',
   'https://www.compugen.ca',
   '101 City Centre Drive', 'Mississauga', 'ON', 'L5B 2T4', 'CA',
   'active', 'MSP',
   'National IT solutions and managed services provider specializing in enterprise infrastructure and cloud.',
   v_owner),

  ('Futuretek IT Solutions',
   'https://www.futuretek.ca',
   '4400 Dominion Street', 'Burnaby', 'BC', 'V5G 4G3', 'CA',
   'active', 'MSP',
   'BC-based managed services and IT support company serving small to mid-size businesses.',
   v_owner),

  ('Microserve Solutions',
   'https://www.microserve.ca',
   '2200 Thurston Drive', 'Ottawa', 'ON', 'K1G 4K7', 'CA',
   'active', 'MSP',
   'Canadian IT managed services provider offering help desk, infrastructure, and cloud support.',
   v_owner),

  ('Convergence Networks',
   'https://www.convergencenetworks.ca',
   '1565 Carling Avenue', 'Ottawa', 'ON', 'K1Z 8R1', 'CA',
   'active', 'MSP',
   'Ottawa-area MSP providing networking, security, and managed IT services to government and enterprise.',
   v_owner),

  ('IT Weapons',
   'https://www.itweapons.com',
   '75 Clegg Road', 'Markham', 'ON', 'L6G 1B8', 'CA',
   'active', 'MSP',
   'Ontario-based managed services company delivering security-first IT support and cloud solutions.',
   v_owner),

  ('Scalar Decisions',
   'https://www.scalar.ca',
   '60 Atlantic Avenue', 'Toronto', 'ON', 'M6K 1X9', 'CA',
   'active', 'MSP',
   'Canadian IT solutions and managed services firm focused on cloud, data, and security transformation.',
   v_owner),

  ('ThinkOn Inc',
   'https://www.thinkon.com',
   '55 University Avenue', 'Toronto', 'ON', 'M5J 2H7', 'CA',
   'active', 'MSP',
   'Cloud and managed services provider offering Infrastructure-as-a-Service and DRaaS to Canadian businesses.',
   v_owner),

  ('Coreio IT Services',
   'https://www.coreio.com',
   '5000 Yonge Street', 'Toronto', 'ON', 'M2N 7E9', 'CA',
   'active', 'MSP',
   'IT managed services and outsourcing company providing end-user computing and service desk solutions.',
   v_owner),

  ('Dataprise Canada',
   'https://www.dataprise.com',
   '99 Bank Street', 'Ottawa', 'ON', 'K1P 6B9', 'CA',
   'active', 'MSP',
   'Full-service managed IT and cybersecurity provider serving mid-market businesses across North America.',
   v_owner),

  ('Softchoice Corporation',
   'https://www.softchoice.com',
   '173 Dufferin Street', 'Toronto', 'ON', 'M6K 3H7', 'CA',
   'active', 'MSP',
   'North American IT solutions and managed services company specializing in software, cloud, and lifecycle.',
   v_owner);

END $$;

--
-- PostgreSQL database dump
--

\restrict wU3sUOQ39rSzexpyGhUDwRFYdgsXOVyh5gSX2YPT2yYeEDBb1mJl3fbpLmQUBx7

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-11-05 08:35:19

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 222 (class 1259 OID 16428)
-- Name: berkas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.berkas (
    id integer NOT NULL,
    diunggah_oleh integer NOT NULL,
    nama_berkas character varying(255) NOT NULL,
    lokasi_berkas character varying(255) NOT NULL,
    tipe_mimet character varying(100),
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.berkas OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16427)
-- Name: berkas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.berkas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.berkas_id_seq OWNER TO postgres;

--
-- TOC entry 5106 (class 0 OID 0)
-- Dependencies: 221
-- Name: berkas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.berkas_id_seq OWNED BY public.berkas.id;


--
-- TOC entry 226 (class 1259 OID 16465)
-- Name: dokumen_pendaftaran; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dokumen_pendaftaran (
    id integer NOT NULL,
    pengguna_id integer NOT NULL,
    berkas_id integer NOT NULL,
    jenis_dokumen character varying(50) NOT NULL,
    status_verifikasi character varying(20) DEFAULT 'menunggu'::character varying,
    diperiksa_oleh integer,
    catatan_verifikasi text,
    diperiksa_pada timestamp without time zone,
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dokumen_pendaftaran_status_verifikasi_check CHECK (((status_verifikasi)::text = ANY ((ARRAY['menunggu'::character varying, 'disetujui'::character varying, 'ditolak'::character varying])::text[])))
);


ALTER TABLE public.dokumen_pendaftaran OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16464)
-- Name: dokumen_pendaftaran_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dokumen_pendaftaran_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dokumen_pendaftaran_id_seq OWNER TO postgres;

--
-- TOC entry 5107 (class 0 OID 0)
-- Dependencies: 225
-- Name: dokumen_pendaftaran_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dokumen_pendaftaran_id_seq OWNED BY public.dokumen_pendaftaran.id;


--
-- TOC entry 224 (class 1259 OID 16447)
-- Name: kompetisi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kompetisi (
    id integer NOT NULL,
    nama character varying(50) NOT NULL,
    deskripsi text,
    materi_dibuka_pada timestamp without time zone,
    materi_ditutup_pada timestamp without time zone,
    batas_pengumpulan timestamp without time zone,
    hasil_diumumkan_pada timestamp without time zone,
    dibuat_oleh integer NOT NULL,
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.kompetisi OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16446)
-- Name: kompetisi_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.kompetisi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.kompetisi_id_seq OWNER TO postgres;

--
-- TOC entry 5108 (class 0 OID 0)
-- Dependencies: 223
-- Name: kompetisi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.kompetisi_id_seq OWNED BY public.kompetisi.id;


--
-- TOC entry 228 (class 1259 OID 16496)
-- Name: materi_kompetisi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.materi_kompetisi (
    id integer NOT NULL,
    kompetisi_id integer NOT NULL,
    berkas_id integer NOT NULL,
    diunggah_oleh integer NOT NULL,
    judul character varying(100) NOT NULL,
    deskripsi text,
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.materi_kompetisi OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16495)
-- Name: materi_kompetisi_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.materi_kompetisi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.materi_kompetisi_id_seq OWNER TO postgres;

--
-- TOC entry 5109 (class 0 OID 0)
-- Dependencies: 227
-- Name: materi_kompetisi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.materi_kompetisi_id_seq OWNED BY public.materi_kompetisi.id;


--
-- TOC entry 220 (class 1259 OID 16411)
-- Name: pengguna; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pengguna (
    id integer NOT NULL,
    email character varying(50) NOT NULL,
    kata_sandi character varying(255) NOT NULL,
    nama_lengkap character varying(100) NOT NULL,
    peran character varying(20),
    asal_instansi character varying(150),
    nomor_telepon character varying(255),
    tanggal_lahir date,
    status_akun character varying(15),
    status_pendaftaran character varying(20),
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pengguna_peran_check CHECK (((peran)::text = ANY ((ARRAY['peserta'::character varying, 'panitia'::character varying, 'juri'::character varying])::text[]))),
    CONSTRAINT pengguna_status_akun_check CHECK (((status_akun)::text = ANY ((ARRAY['aktif'::character varying, 'ditangguhkan'::character varying])::text[]))),
    CONSTRAINT pengguna_status_pendaftaran_check CHECK (((status_pendaftaran)::text = ANY ((ARRAY['menunggu'::character varying, 'terverifikasi'::character varying, 'ditolak'::character varying])::text[])))
);


ALTER TABLE public.pengguna OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16410)
-- Name: pengguna_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pengguna_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pengguna_id_seq OWNER TO postgres;

--
-- TOC entry 5110 (class 0 OID 0)
-- Dependencies: 219
-- Name: pengguna_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pengguna_id_seq OWNED BY public.pengguna.id;


--
-- TOC entry 230 (class 1259 OID 16542)
-- Name: pengumpulan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pengumpulan (
    id integer NOT NULL,
    kompetisi_id integer NOT NULL,
    pengguna_id integer NOT NULL,
    berkas_id integer NOT NULL,
    jenis_pengumpulan character varying(20),
    status character varying(20) DEFAULT 'dikumpulkan'::character varying,
    dikumpulkan_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pengumpulan_jenis_pengumpulan_check CHECK (((jenis_pengumpulan)::text = ANY ((ARRAY['pka'::character varying, 'poc'::character varying, 'cisco'::character varying])::text[]))),
    CONSTRAINT pengumpulan_status_check CHECK (((status)::text = ANY ((ARRAY['dikumpulkan'::character varying, 'ditarik'::character varying])::text[])))
);


ALTER TABLE public.pengumpulan OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16541)
-- Name: pengumpulan_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pengumpulan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pengumpulan_id_seq OWNER TO postgres;

--
-- TOC entry 5111 (class 0 OID 0)
-- Dependencies: 229
-- Name: pengumpulan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pengumpulan_id_seq OWNED BY public.pengumpulan.id;


--
-- TOC entry 232 (class 1259 OID 16573)
-- Name: penilaian; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.penilaian (
    id integer NOT NULL,
    pengumpulan_id integer NOT NULL,
    juri_id integer NOT NULL,
    ditugaskan_oleh integer NOT NULL,
    nilai numeric(5,2),
    komentar text,
    status character varying(20) DEFAULT 'ditugaskan'::character varying,
    ditugaskan_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    difinalisasi_pada timestamp without time zone,
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT penilaian_status_check CHECK (((status)::text = ANY ((ARRAY['ditugaskan'::character varying, 'draf'::character varying, 'final'::character varying])::text[])))
);


ALTER TABLE public.penilaian OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16572)
-- Name: penilaian_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.penilaian_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.penilaian_id_seq OWNER TO postgres;

--
-- TOC entry 5112 (class 0 OID 0)
-- Dependencies: 231
-- Name: penilaian_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.penilaian_id_seq OWNED BY public.penilaian.id;


--
-- TOC entry 4888 (class 2604 OID 16431)
-- Name: berkas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.berkas ALTER COLUMN id SET DEFAULT nextval('public.berkas_id_seq'::regclass);


--
-- TOC entry 4892 (class 2604 OID 16468)
-- Name: dokumen_pendaftaran id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dokumen_pendaftaran ALTER COLUMN id SET DEFAULT nextval('public.dokumen_pendaftaran_id_seq'::regclass);


--
-- TOC entry 4890 (class 2604 OID 16450)
-- Name: kompetisi id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kompetisi ALTER COLUMN id SET DEFAULT nextval('public.kompetisi_id_seq'::regclass);


--
-- TOC entry 4895 (class 2604 OID 16499)
-- Name: materi_kompetisi id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materi_kompetisi ALTER COLUMN id SET DEFAULT nextval('public.materi_kompetisi_id_seq'::regclass);


--
-- TOC entry 4886 (class 2604 OID 16414)
-- Name: pengguna id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengguna ALTER COLUMN id SET DEFAULT nextval('public.pengguna_id_seq'::regclass);


--
-- TOC entry 4897 (class 2604 OID 16545)
-- Name: pengumpulan id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengumpulan ALTER COLUMN id SET DEFAULT nextval('public.pengumpulan_id_seq'::regclass);


--
-- TOC entry 4901 (class 2604 OID 16576)
-- Name: penilaian id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penilaian ALTER COLUMN id SET DEFAULT nextval('public.penilaian_id_seq'::regclass);


--
-- TOC entry 5090 (class 0 OID 16428)
-- Dependencies: 222
-- Data for Name: berkas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.berkas (id, diunggah_oleh, nama_berkas, lokasi_berkas, tipe_mimet, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 5094 (class 0 OID 16465)
-- Dependencies: 226
-- Data for Name: dokumen_pendaftaran; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dokumen_pendaftaran (id, pengguna_id, berkas_id, jenis_dokumen, status_verifikasi, diperiksa_oleh, catatan_verifikasi, diperiksa_pada, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 5092 (class 0 OID 16447)
-- Dependencies: 224
-- Data for Name: kompetisi; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.kompetisi (id, nama, deskripsi, materi_dibuka_pada, materi_ditutup_pada, batas_pengumpulan, hasil_diumumkan_pada, dibuat_oleh, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 5096 (class 0 OID 16496)
-- Dependencies: 228
-- Data for Name: materi_kompetisi; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.materi_kompetisi (id, kompetisi_id, berkas_id, diunggah_oleh, judul, deskripsi, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 5088 (class 0 OID 16411)
-- Dependencies: 220
-- Data for Name: pengguna; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pengguna (id, email, kata_sandi, nama_lengkap, peran, asal_instansi, nomor_telepon, tanggal_lahir, status_akun, status_pendaftaran, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 5098 (class 0 OID 16542)
-- Dependencies: 230
-- Data for Name: pengumpulan; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pengumpulan (id, kompetisi_id, pengguna_id, berkas_id, jenis_pengumpulan, status, dikumpulkan_pada, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 5100 (class 0 OID 16573)
-- Dependencies: 232
-- Data for Name: penilaian; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.penilaian (id, pengumpulan_id, juri_id, ditugaskan_oleh, nilai, komentar, status, ditugaskan_pada, difinalisasi_pada, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 5113 (class 0 OID 0)
-- Dependencies: 221
-- Name: berkas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.berkas_id_seq', 1, false);


--
-- TOC entry 5114 (class 0 OID 0)
-- Dependencies: 225
-- Name: dokumen_pendaftaran_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dokumen_pendaftaran_id_seq', 1, false);


--
-- TOC entry 5115 (class 0 OID 0)
-- Dependencies: 223
-- Name: kompetisi_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.kompetisi_id_seq', 1, false);


--
-- TOC entry 5116 (class 0 OID 0)
-- Dependencies: 227
-- Name: materi_kompetisi_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.materi_kompetisi_id_seq', 1, false);


--
-- TOC entry 5117 (class 0 OID 0)
-- Dependencies: 219
-- Name: pengguna_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pengguna_id_seq', 1, false);


--
-- TOC entry 5118 (class 0 OID 0)
-- Dependencies: 229
-- Name: pengumpulan_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pengumpulan_id_seq', 1, false);


--
-- TOC entry 5119 (class 0 OID 0)
-- Dependencies: 231
-- Name: penilaian_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.penilaian_id_seq', 1, false);


--
-- TOC entry 4915 (class 2606 OID 16440)
-- Name: berkas berkas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.berkas
    ADD CONSTRAINT berkas_pkey PRIMARY KEY (id);


--
-- TOC entry 4919 (class 2606 OID 16479)
-- Name: dokumen_pendaftaran dokumen_pendaftaran_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dokumen_pendaftaran
    ADD CONSTRAINT dokumen_pendaftaran_pkey PRIMARY KEY (id);


--
-- TOC entry 4917 (class 2606 OID 16458)
-- Name: kompetisi kompetisi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kompetisi
    ADD CONSTRAINT kompetisi_pkey PRIMARY KEY (id);


--
-- TOC entry 4921 (class 2606 OID 16509)
-- Name: materi_kompetisi materi_kompetisi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materi_kompetisi
    ADD CONSTRAINT materi_kompetisi_pkey PRIMARY KEY (id);


--
-- TOC entry 4913 (class 2606 OID 16426)
-- Name: pengguna pengguna_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengguna
    ADD CONSTRAINT pengguna_pkey PRIMARY KEY (id);


--
-- TOC entry 4923 (class 2606 OID 16556)
-- Name: pengumpulan pengumpulan_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengumpulan
    ADD CONSTRAINT pengumpulan_pkey PRIMARY KEY (id);


--
-- TOC entry 4925 (class 2606 OID 16588)
-- Name: penilaian penilaian_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penilaian
    ADD CONSTRAINT penilaian_pkey PRIMARY KEY (id);


--
-- TOC entry 4926 (class 2606 OID 16441)
-- Name: berkas fk_berkas_pengguna; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.berkas
    ADD CONSTRAINT fk_berkas_pengguna FOREIGN KEY (diunggah_oleh) REFERENCES public.pengguna(id) ON DELETE CASCADE;


--
-- TOC entry 4928 (class 2606 OID 16485)
-- Name: dokumen_pendaftaran fk_dokpen_berkas; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dokumen_pendaftaran
    ADD CONSTRAINT fk_dokpen_berkas FOREIGN KEY (berkas_id) REFERENCES public.berkas(id);


--
-- TOC entry 4929 (class 2606 OID 16480)
-- Name: dokumen_pendaftaran fk_dokpen_pengguna; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dokumen_pendaftaran
    ADD CONSTRAINT fk_dokpen_pengguna FOREIGN KEY (pengguna_id) REFERENCES public.pengguna(id);


--
-- TOC entry 4930 (class 2606 OID 16490)
-- Name: dokumen_pendaftaran fk_dokpen_penilai; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dokumen_pendaftaran
    ADD CONSTRAINT fk_dokpen_penilai FOREIGN KEY (diperiksa_oleh) REFERENCES public.pengguna(id) ON DELETE SET NULL;


--
-- TOC entry 4927 (class 2606 OID 16459)
-- Name: kompetisi fk_kompetisi_pengguna; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kompetisi
    ADD CONSTRAINT fk_kompetisi_pengguna FOREIGN KEY (dibuat_oleh) REFERENCES public.pengguna(id);


--
-- TOC entry 4931 (class 2606 OID 16515)
-- Name: materi_kompetisi fk_matkom_berkas; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materi_kompetisi
    ADD CONSTRAINT fk_matkom_berkas FOREIGN KEY (berkas_id) REFERENCES public.berkas(id);


--
-- TOC entry 4932 (class 2606 OID 16510)
-- Name: materi_kompetisi fk_matkom_kompetisi; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materi_kompetisi
    ADD CONSTRAINT fk_matkom_kompetisi FOREIGN KEY (kompetisi_id) REFERENCES public.kompetisi(id);


--
-- TOC entry 4933 (class 2606 OID 16520)
-- Name: materi_kompetisi fk_matkom_pengguna; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materi_kompetisi
    ADD CONSTRAINT fk_matkom_pengguna FOREIGN KEY (diunggah_oleh) REFERENCES public.pengguna(id);


--
-- TOC entry 4934 (class 2606 OID 16567)
-- Name: pengumpulan fk_pengumpulan_berkas; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengumpulan
    ADD CONSTRAINT fk_pengumpulan_berkas FOREIGN KEY (berkas_id) REFERENCES public.berkas(id);


--
-- TOC entry 4935 (class 2606 OID 16557)
-- Name: pengumpulan fk_pengumpulan_kompetisi; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengumpulan
    ADD CONSTRAINT fk_pengumpulan_kompetisi FOREIGN KEY (kompetisi_id) REFERENCES public.kompetisi(id);


--
-- TOC entry 4936 (class 2606 OID 16562)
-- Name: pengumpulan fk_pengumpulan_pengguna; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengumpulan
    ADD CONSTRAINT fk_pengumpulan_pengguna FOREIGN KEY (pengguna_id) REFERENCES public.pengguna(id);


--
-- TOC entry 4937 (class 2606 OID 16594)
-- Name: penilaian fk_penilaian_juri; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penilaian
    ADD CONSTRAINT fk_penilaian_juri FOREIGN KEY (juri_id) REFERENCES public.pengguna(id);


--
-- TOC entry 4938 (class 2606 OID 16599)
-- Name: penilaian fk_penilaian_pembuat; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penilaian
    ADD CONSTRAINT fk_penilaian_pembuat FOREIGN KEY (ditugaskan_oleh) REFERENCES public.pengguna(id);


--
-- TOC entry 4939 (class 2606 OID 16589)
-- Name: penilaian fk_penilaian_pengumpulan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.penilaian
    ADD CONSTRAINT fk_penilaian_pengumpulan FOREIGN KEY (pengumpulan_id) REFERENCES public.pengumpulan(id);


-- Completed on 2026-11-05 08:35:19

--
-- PostgreSQL database dump complete
--

\unrestrict wU3sUOQ39rSzexpyGhUDwRFYdgsXOVyh5gSX2YPT2yYeEDBb1mJl3fbpLmQUBx7


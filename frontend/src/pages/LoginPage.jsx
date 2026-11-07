import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, GraduationCap, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { roleHome } from "../navigation.js";
import { Button } from "../components/ui/Button.jsx";
import { Input } from "../components/ui/Input.jsx";

const apiError = (error) => error.response?.data?.message || error.message || "Sign-in failed. Please try again.";

function AccountSignIn({ onSuccess, onBack }) {
  const { signInAccounts } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await signInAccounts({ email, password });
      onSuccess(user);
    } catch (requestError) {
      setError(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={15} />All sign-in options</button>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Accounts team</p>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Welcome back</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to your Coachify accounts workspace.</p>
      </div>
      <form className="space-y-5" onSubmit={submit}>
        <Input id="accounts-email" label="Work email" type="email" autoComplete="username" placeholder="you@institute.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Input id="accounts-password" label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
        <Button type="submit" size="lg" loading={busy} className="w-full">Sign in <ArrowRight size={16} /></Button>
      </form>
    </>
  );
}

function CounsellorSignIn({ onSuccess, onBack }) {
  const { signInCounsellor } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await signInCounsellor({ email, password });
      onSuccess(user);
    } catch (requestError) {
      const status = requestError.response?.status;
      setError(status === 401
        ? "Unable to sign in. Check your email and password, and confirm your account is active."
        : apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={15} />All sign-in options</button>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Counsellor workspace</p>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Staff sign in</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Use your institute email and password to access your workspace.</p>
      </div>
      <form className="space-y-5" onSubmit={submit}>
        <Input id="counsellor-email" label="Work email" type="email" autoComplete="username" placeholder="you@institute.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Input id="counsellor-password" label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in <ArrowRight size={16} /></Button>
      </form>
    </>
  );
}

function ParentSignIn({ onSuccess, onBack }) {
  const { requestParentOtp, signInParent } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const submitPhone = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestParentOtp(phone);
      setNotice(result.devOtp
        ? `${result.message} Development code: ${result.devOtp}`
        : result.message || "If this number is linked to an active parent account, a code is available.");
      setStep("otp");
    } catch (requestError) {
      setError(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await signInParent({ phone, otp });
      onSuccess(user);
    } catch (requestError) {
      setError(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={15} />All sign-in options</button>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Parent portal</p>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">{step === "phone" ? "Sign in with your phone" : "Check your messages"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{step === "phone" ? "We’ll send a one-time code to the number linked to your account." : `Enter the one-time code for ${phone}.`}</p>
      </div>
      {step === "phone" ? (
        <form className="space-y-5" onSubmit={submitPhone}>
          <Input id="parent-phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit phone number" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
          <Button type="submit" size="lg" loading={busy} className="w-full">Send one-time code <ArrowRight size={16} /></Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={submitOtp}>
          <Input id="parent-otp" label="One-time code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter your code" value={otp} onChange={(event) => setOtp(event.target.value)} required />
          {notice && <p className="rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-3 text-sm text-brand-700">{notice}</p>}
          {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
          <Button type="submit" size="lg" loading={busy} className="w-full">Verify and sign in <ArrowRight size={16} /></Button>
          <button type="button" onClick={() => { setStep("phone"); setOtp(""); setError(""); setNotice(""); }} className="w-full py-1 text-xs font-semibold text-slate-500 hover:text-brand-700">Use a different phone number</button>
        </form>
      )}
    </>
  );
}

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState("choice");
  if (user) return <Navigate to={roleHome(user.role)} replace />;

  const onSuccess = (signedInUser) => {
    const allowedPath = location.state?.from?.pathname;
    navigate(allowedPath?.startsWith(roleHome(signedInUser.role)) ? allowedPath : roleHome(signedInUser.role), { replace: true });
  };

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(430px,0.92fr)_1.08fr]">
      <section className="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-[13%]">
        <a href="/" className="inline-flex w-fit items-center gap-2.5" aria-label="Coachify">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white"><GraduationCap size={20} /></span>
          <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">coachify<span className="text-brand-600">.</span></span>
        </a>
        <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col justify-center py-12">
          {mode === "accounts" && <AccountSignIn onBack={() => setMode("choice")} onSuccess={onSuccess} />}
          {mode === "parent" && <ParentSignIn onBack={() => setMode("choice")} onSuccess={onSuccess} />}
          {mode === "counsellor" && <CounsellorSignIn onBack={() => setMode("choice")} onSuccess={onSuccess} />}
          {mode === "choice" && (
            <>
              <div className="mb-8">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-600">Welcome to Coachify</p>
                <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-tight text-slate-900">A simpler way to stay on top of things.</h1>
                <p className="mt-3 text-sm leading-6 text-slate-500">Choose your workspace to continue securely.</p>
              </div>
              <div className="space-y-3">
                <button onClick={() => setMode("accounts")} className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><LockKeyhole size={19} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Accounts team</span><span className="mt-1 block text-xs text-slate-500">Sign in with your work email</span></span>
                  <ArrowRight size={17} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </button>
                <button onClick={() => setMode("parent")} className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><ShieldCheck size={19} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Parent portal</span><span className="mt-1 block text-xs text-slate-500">Continue with a one-time code</span></span>
                  <ArrowRight size={17} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </button>
                <button onClick={() => setMode("counsellor")} className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><LockKeyhole size={19} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Counsellor</span><span className="mt-1 block text-xs text-slate-500">Staff email and password sign-in</span></span>
                  <ArrowRight size={17} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </button>
              </div>
              <p className="mt-8 text-center text-xs text-slate-400">Secure access for your institute community</p>
            </>
          )}
        </div>
        <p className="text-xs text-slate-400">© 2026 Coachify. Built for better learning.</p>
      </section>
      <aside className="relative hidden overflow-hidden bg-[#172452] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-36 -top-32 size-[520px] rounded-full border border-white/[0.07]" />
        <div className="absolute -right-16 -top-8 size-[360px] rounded-full border border-white/[0.08]" />
        <div className="absolute -bottom-48 -left-36 size-[520px] rounded-full border border-white/[0.06]" />
        <div className="relative z-10 ml-auto flex max-w-xl flex-1 flex-col justify-center">
          <span className="mb-6 grid size-12 place-items-center rounded-xl border border-white/10 bg-white/[0.08]"><GraduationCap size={24} /></span>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">One connected institute</p>
          <h2 className="font-display text-4xl font-extrabold leading-[1.2] tracking-tight xl:text-[46px]">More clarity for your team. More confidence for every family.</h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-indigo-100/70">A considered workspace for the people who keep learning moving forward.</p>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-indigo-100/75">
            {["Thoughtful by design", "Secure sign-in", "Made for every centre"].map((item) => <span key={item} className="inline-flex items-center gap-2"><Check size={14} className="text-indigo-300" />{item}</span>)}
          </div>
        </div>
        <p className="relative z-10 text-xs text-indigo-100/45">A better view of what matters.</p>
      </aside>
    </main>
  );
}

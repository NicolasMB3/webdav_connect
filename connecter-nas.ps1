Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Configuration ──
$serverPath = "https://stockage.cmc-06.fr:5006/backup"
$driveLetter = "V:"

# ── Interface graphique ──
$form = New-Object System.Windows.Forms.Form
$form.Text = "Connexion NAS"
$form.Size = New-Object System.Drawing.Size(380, 280)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

# Titre
$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Connexion au NAS"
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$lblTitle.Location = New-Object System.Drawing.Point(20, 15)
$lblTitle.AutoSize = $true
$form.Controls.Add($lblTitle)

# Serveur (info)
$lblServer = New-Object System.Windows.Forms.Label
$lblServer.Text = "stockage.cmc-06.fr:5006/backup → $driveLetter"
$lblServer.ForeColor = [System.Drawing.Color]::Gray
$lblServer.Location = New-Object System.Drawing.Point(20, 45)
$lblServer.AutoSize = $true
$form.Controls.Add($lblServer)

# Identifiant
$lblUser = New-Object System.Windows.Forms.Label
$lblUser.Text = "Identifiant :"
$lblUser.Location = New-Object System.Drawing.Point(20, 80)
$lblUser.AutoSize = $true
$form.Controls.Add($lblUser)

$txtUser = New-Object System.Windows.Forms.TextBox
$txtUser.Location = New-Object System.Drawing.Point(20, 105)
$txtUser.Size = New-Object System.Drawing.Size(320, 30)
$form.Controls.Add($txtUser)

# Mot de passe
$lblPass = New-Object System.Windows.Forms.Label
$lblPass.Text = "Mot de passe :"
$lblPass.Location = New-Object System.Drawing.Point(20, 140)
$lblPass.AutoSize = $true
$form.Controls.Add($lblPass)

$txtPass = New-Object System.Windows.Forms.TextBox
$txtPass.Location = New-Object System.Drawing.Point(20, 165)
$txtPass.Size = New-Object System.Drawing.Size(320, 30)
$txtPass.UseSystemPasswordChar = $true
$form.Controls.Add($txtPass)

# Bouton Connecter
$btnConnect = New-Object System.Windows.Forms.Button
$btnConnect.Text = "Connecter"
$btnConnect.Location = New-Object System.Drawing.Point(140, 205)
$btnConnect.Size = New-Object System.Drawing.Size(110, 35)
$btnConnect.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $btnConnect
$form.Controls.Add($btnConnect)

# Bouton Annuler
$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "Annuler"
$btnCancel.Location = New-Object System.Drawing.Point(255, 205)
$btnCancel.Size = New-Object System.Drawing.Size(85, 35)
$btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $btnCancel
$form.Controls.Add($btnCancel)

$form.TopMost = $true
$result = $form.ShowDialog()

if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    exit
}

$user = $txtUser.Text
$pass = $txtPass.Text

if ([string]::IsNullOrWhiteSpace($user) -or [string]::IsNullOrWhiteSpace($pass)) {
    [System.Windows.Forms.MessageBox]::Show("Identifiant et mot de passe requis.", "Erreur", "OK", "Error")
    exit
}

# ── Demarrer WebClient en admin si necessaire ──
$svc = Get-Service WebClient -ErrorAction SilentlyContinue
if ($svc.Status -ne "Running") {
    Start-Process powershell -ArgumentList "-WindowStyle Hidden -Command `"Start-Service WebClient`"" -Verb RunAs -Wait
    Start-Sleep -Seconds 2
}

# ── Deconnecter le lecteur si deja utilise ──
net use $driveLetter /delete /yes 2>$null | Out-Null

# ── Connexion WebDAV (session utilisateur normale) ──
$output = net use $driveLetter $serverPath /user:$user $pass /persistent:yes 2>&1

if ($LASTEXITCODE -eq 0) {
    # Renommer le lecteur dans l'explorateur
    $shell = New-Object -ComObject Shell.Application
    $shell.NameSpace("$driveLetter\").Self.Name = "NAS CMC06"

    [System.Windows.Forms.MessageBox]::Show(
        "NAS connecte sur $driveLetter`nChemin : $serverPath",
        "Connexion reussie", "OK", "Information"
    )
    explorer.exe "$driveLetter\"
} else {
    [System.Windows.Forms.MessageBox]::Show(
        "Echec de la connexion :`n$output",
        "Erreur", "OK", "Error"
    )
}

// 3차 시험용 WinForms 앱. REA Adapter의 .NET 수집원이 무엇을 읽어 내는지 확인하는 데만 쓴다.
using System;
using System.Windows.Forms;

namespace ReaAdapterFixture
{
    public class MainForm : Form
    {
        private MenuStrip menu;
        private ToolStripMenuItem fileMenu;
        private ToolStripMenuItem saveMenuItem;
        private Button btnRun;
        private TextBox txtInput;

        public MainForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            menu = new MenuStrip();
            fileMenu = new ToolStripMenuItem();
            saveMenuItem = new ToolStripMenuItem();
            btnRun = new Button();
            txtInput = new TextBox();

            fileMenu.Text = "파일(&F)";
            saveMenuItem.Text = "저장(&S)";
            saveMenuItem.ShortcutKeys = Keys.Control | Keys.S;
            saveMenuItem.Click += saveMenuItem_Click;
            fileMenu.DropDownItems.Add(saveMenuItem);
            menu.Items.Add(fileMenu);

            btnRun.Name = "btnRun";
            btnRun.Text = "실행";
            btnRun.Click += btnRun_Click;

            txtInput.Name = "txtInput";
            txtInput.TextChanged += txtInput_TextChanged;

            Controls.Add(txtInput);
            Controls.Add(btnRun);
            Controls.Add(menu);
            MainMenuStrip = menu;
            Text = "시험 앱";
        }

        private void saveMenuItem_Click(object sender, EventArgs e) { }

        private void btnRun_Click(object sender, EventArgs e) { }

        private void txtInput_TextChanged(object sender, EventArgs e) { }

        public void RunJob(string name) { }

        [STAThread]
        public static void Main()
        {
            Application.Run(new MainForm());
        }
    }
}

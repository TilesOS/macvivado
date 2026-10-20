from pathlib import Path
import json
board=json.loads(Path('resources/boards/nexys-a7-100t.json').read_text())
def example(slug,name,ports,rtl,tb,clock=True):
    root=Path('examples')/slug
    (root/'rtl').mkdir(parents=True,exist_ok=True)
    (root/'sim').mkdir(exist_ok=True)
    (root/'constraints').mkdir(exist_ok=True)
    cfg={'version':1,'name':name,'board':'nexys-a7-100t','top':'top','sources':['rtl/top.v'],'includeDirectories':[],'defines':{},'constraints':['constraints/nexys.xdc'],'simulation':{'top':'tb','sources':['sim/tb.v'],'timeoutMs':10000}}
    (root/'macvivado.json').write_text(json.dumps(cfg,indent=2)+'\n')
    (root/'rtl/top.v').write_text(rtl)
    (root/'sim/tb.v').write_text(tb)
    lines=['# Derived from Digilent Nexys-A7-100T-Master.xdc. Preserve bank voltage standards.']
    for target,official in ports:
        p=board['pins'][official]
        lines += ['set_property -dict { PACKAGE_PIN '+p['pin']+' IOSTANDARD '+p['standard']+' } [get_ports { '+target+' }];']
    if clock: lines+=['create_clock -period 10.00 -name sys_clk [get_ports { CLK100MHZ }];']
    (root/'constraints/nexys.xdc').write_text('\n'.join(lines)+'\n')
example('blink','LED blink',[('CLK100MHZ','CLK100MHZ'),('LED','LED[0]')],'''// Nexys A7: 100 MHz clock; LED0 toggles every half second.
module top #(parameter HALF_PERIOD = 50000000)(input wire CLK100MHZ, output reg LED = 0);
    localparam WIDTH = $clog2(HALF_PERIOD) < 1 ? 1 : $clog2(HALF_PERIOD);
    reg [WIDTH-1:0] ticks = 0;
    always @(posedge CLK100MHZ) begin
        if (ticks == HALF_PERIOD-1) begin
            ticks <= 0;
            LED <= ~LED;
        end else ticks <= ticks + 1'b1;
    end
endmodule
''','''`timescale 1ns/1ps
module tb;
    reg CLK100MHZ = 0;
    wire LED;
    top #(.HALF_PERIOD(4)) dut(.CLK100MHZ(CLK100MHZ), .LED(LED));
    always #5 CLK100MHZ = ~CLK100MHZ;
    integer i;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb);
        for (i = 1; i <= 16; i = i + 1) begin
            @(posedge CLK100MHZ); #1;
            if (LED !== ((i / 4) % 2)) $fatal(1, "Blink period mismatch at cycle %0d", i);
        end
        $display("PASS: blink toggles exactly every four cycles"); $finish;
    end
endmodule
''')
example('switch-to-led','Switch to LED',[(f'SW[{i}]',f'SW[{i}]') for i in range(16)]+[(f'LED[{i}]',f'LED[{i}]') for i in range(16)],'''// Switches 8 and 9 use LVCMOS18; see the board constraints.
module top(input wire [15:0] SW, output wire [15:0] LED);
    assign LED = SW;
endmodule
''','''`timescale 1ns/1ps
module tb;
    reg [15:0] SW = 0;
    wire [15:0] LED;
    top dut(.SW(SW), .LED(LED));
    integer i;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 65536; i = i + 257) begin
            SW = i; #10;
            if (LED !== SW) $fatal(1, "Switch mismatch: %h != %h", LED, SW);
        end
        $display("PASS: 256 switch patterns pass through unchanged"); $finish;
    end
endmodule
''',False)
example('seven-segment','Button counter',[('CLK100MHZ','CLK100MHZ'),('BTNC','BTNC'),('BTND','BTND')]+[(f'SEG[{i}]',p) for i,p in enumerate(['CA','CB','CC','CD','CE','CF','CG'])]+[(f'AN[{i}]',f'AN[{i}]') for i in range(8)]+[('DP','DP')],'''// Center: increment; down: reset. Rightmost digit, active-low segments.
module top #(parameter DEBOUNCE_CYCLES = 2000000)(
    input wire CLK100MHZ, input wire BTNC, input wire BTND,
    output wire [6:0] SEG, output wire [7:0] AN, output wire DP
);
    localparam W = $clog2(DEBOUNCE_CYCLES) < 1 ? 1 : $clog2(DEBOUNCE_CYCLES);
    (* ASYNC_REG = "TRUE" *) reg [1:0] button_sync = 0;
    (* ASYNC_REG = "TRUE" *) reg [1:0] reset_sync = 0;
    reg [W-1:0] stable_ticks = 0;
    reg pressed = 0;
    reg [3:0] count = 0;
    always @(posedge CLK100MHZ) begin
        button_sync <= {button_sync[0], BTNC};
        reset_sync <= {reset_sync[0], BTND};
        if (reset_sync[1]) begin
            count <= 0; pressed <= 0; stable_ticks <= 0;
        end else if (button_sync[1] == pressed) stable_ticks <= 0;
        else if (stable_ticks == DEBOUNCE_CYCLES-1) begin
            stable_ticks <= 0; pressed <= button_sync[1];
            if (button_sync[1]) count <= count == 9 ? 0 : count + 1'b1;
        end else stable_ticks <= stable_ticks + 1'b1;
    end
    assign AN = 8'b11111110;
    assign DP = 1'b1;
    assign SEG = count == 0 ? 7'b1000000 :
                 count == 1 ? 7'b1111001 :
                 count == 2 ? 7'b0100100 :
                 count == 3 ? 7'b0110000 :
                 count == 4 ? 7'b0011001 :
                 count == 5 ? 7'b0010010 :
                 count == 6 ? 7'b0000010 :
                 count == 7 ? 7'b1111000 :
                 count == 8 ? 7'b0000000 :
                 count == 9 ? 7'b0010000 : 7'b1111111;
endmodule
''','''`timescale 1ns/1ps
module tb;
    reg CLK100MHZ = 0, BTNC = 0, BTND = 0;
    wire [6:0] SEG; wire [7:0] AN; wire DP;
    top #(.DEBOUNCE_CYCLES(3)) dut(.*);
    always #5 CLK100MHZ = ~CLK100MHZ;
    task cycles(input integer n); repeat(n) begin @(posedge CLK100MHZ); #1; end endtask
    integer i;
    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb);
        cycles(3);
        if (SEG !== 7'b1000000 || AN !== 8'hfe || DP !== 1) $fatal(1, "Initial display incorrect");
        BTNC = 1; cycles(1); BTNC = 0; cycles(8);
        if (dut.count !== 0) $fatal(1, "Short bounce incremented counter");
        BTNC = 1; cycles(12);
        if (dut.count !== 1 || SEG !== 7'b1111001) $fatal(1, "Press did not display one");
        cycles(12); if (dut.count !== 1) $fatal(1, "Held button repeated");
        BTNC = 0; cycles(8);
        for (i = 0; i < 9; i = i + 1) begin BTNC = 1; cycles(8); BTNC = 0; cycles(8); end
        if (dut.count !== 0) $fatal(1, "Decimal wrap failed");
        BTNC = 1; cycles(8); BTNC = 0; cycles(8); BTND = 1; cycles(8);
        if (dut.count !== 0 || SEG !== 7'b1000000) $fatal(1, "Reset failed");
        $display("PASS: debounce, hold, decimal wrap, segments, and reset"); $finish;
    end
endmodule
''')
